import { BitmapCoordinatesRenderingScope } from 'fancy-canvas';

import { Coordinate } from '../model/coordinate';
import { CloudFillColorerStyle, CloudStrokeColorerStyle } from '../model/series-bar-colorer';
import { SeriesItemsIndexesRange, TimedValue } from '../model/time-data';

import { BitmapCoordinatesPaneRenderer } from './bitmap-coordinates-pane-renderer';
import { LineStyle, LineType, LineWidth, setLineStyle } from './draw-line';
import { getControlPoints } from './walk-line';

export type CloudItem = TimedValue & CloudFillColorerStyle & CloudStrokeColorerStyle & {
	x: Coordinate;
	y1: Coordinate;
	y2: Coordinate;
};

export interface PaneRendererCloudData {
	items: CloudItem[];
	visibleRange: SeriesItemsIndexesRange | null;
	barWidth: number;
	lineType: LineType;
	lineWidth: LineWidth;
	lineStyle: LineStyle;
	lineVisible: boolean;
}

interface SegmentPoint {
	x: number;
	y1: number;
	y2: number;
}

interface FillSegment {
	points: SegmentPoint[];
	isBullish: boolean;
}

interface DrawContext {
	ctx: CanvasRenderingContext2D;
	hRatio: number;
	vRatio: number;
}

function findCrossoverX(
	x0: number, y1a: number, y2a: number,
	x1: number, y1b: number, y2b: number
): SegmentPoint | null {
	const diffA = y1a - y2a;
	const diffB = y1b - y2b;

	if (diffA * diffB > 0 || diffA === diffB) {
		return null;
	}

	const t = diffA / (diffA - diffB);
	const crossX = x0 + t * (x1 - x0);
	const crossY = y1a + t * (y1b - y1a);

	return { x: crossX, y1: crossY, y2: crossY };
}

function buildSegments(items: CloudItem[], visibleRange: SeriesItemsIndexesRange): FillSegment[] {
	const segments: FillSegment[] = [];
	let currentPoints: SegmentPoint[] = [];
	let currentIsBullish = items[visibleRange.from].y1 <= items[visibleRange.from].y2;

	currentPoints.push({
		x: items[visibleRange.from].x,
		y1: items[visibleRange.from].y1,
		y2: items[visibleRange.from].y2,
	});

	for (let i = visibleRange.from + 1; i < visibleRange.to; i++) {
		const item = items[i];
		const prevItem = items[i - 1];

		const cross = findCrossoverX(
			prevItem.x, prevItem.y1, prevItem.y2,
			item.x, item.y1, item.y2
		);

		if (cross !== null) {
			currentPoints.push(cross);
			segments.push({ points: currentPoints, isBullish: currentIsBullish });
			currentIsBullish = !currentIsBullish;
			currentPoints = [cross];
		}

		currentPoints.push({ x: item.x, y1: item.y1, y2: item.y2 });
	}

	if (currentPoints.length > 0) {
		segments.push({ points: currentPoints, isBullish: currentIsBullish });
	}

	return segments;
}

function findClosestItemColor(segment: FillSegment, items: CloudItem[], visibleRange: SeriesItemsIndexesRange): string {
	const segMidX = (segment.points[0].x + segment.points[segment.points.length - 1].x) / 2;
	let closestItem = items[visibleRange.from];
	let closestDist = Math.abs(closestItem.x - segMidX);

	for (let i = visibleRange.from + 1; i < visibleRange.to; i++) {
		const dist = Math.abs(items[i].x - segMidX);
		if (dist < closestDist) {
			closestDist = dist;
			closestItem = items[i];
		}
	}

	return segment.isBullish ? closestItem.topColor : closestItem.bottomColor;
}

function toLinePoints(points: SegmentPoint[], yKey: 'y1' | 'y2'): { x: Coordinate; y: Coordinate }[] {
	return points.map((pt: SegmentPoint) => ({ x: pt.x as Coordinate, y: pt[yKey] as Coordinate }));
}

function traceForward(dc: DrawContext, points: SegmentPoint[], lineType: LineType): void {
	const firstPt = points[0];
	dc.ctx.moveTo(firstPt.x * dc.hRatio, firstPt.y1 * dc.vRatio);

	if (lineType === LineType.Curved && points.length > 2) {
		const line1Points = toLinePoints(points, 'y1');
		for (let j = 1; j < line1Points.length; j++) {
			const [cp1, cp2] = getControlPoints(line1Points, j - 1, j);
			dc.ctx.bezierCurveTo(
				cp1.x * dc.hRatio, cp1.y * dc.vRatio,
				cp2.x * dc.hRatio, cp2.y * dc.vRatio,
				line1Points[j].x * dc.hRatio, line1Points[j].y * dc.vRatio
			);
		}
	} else {
		for (let j = 1; j < points.length; j++) {
			const pt = points[j];
			if (lineType === LineType.WithSteps) {
				dc.ctx.lineTo(pt.x * dc.hRatio, points[j - 1].y1 * dc.vRatio);
			}
			dc.ctx.lineTo(pt.x * dc.hRatio, pt.y1 * dc.vRatio);
		}
	}
}

function traceBackward(dc: DrawContext, points: SegmentPoint[], lineType: LineType): void {
	const lastPt = points[points.length - 1];
	dc.ctx.lineTo(lastPt.x * dc.hRatio, lastPt.y2 * dc.vRatio);

	if (lineType === LineType.Curved && points.length > 2) {
		const line2Points = toLinePoints(points, 'y2').reverse();
		for (let j = 1; j < line2Points.length; j++) {
			const [cp1, cp2] = getControlPoints(line2Points, j - 1, j);
			dc.ctx.bezierCurveTo(
				cp1.x * dc.hRatio, cp1.y * dc.vRatio,
				cp2.x * dc.hRatio, cp2.y * dc.vRatio,
				line2Points[j].x * dc.hRatio, line2Points[j].y * dc.vRatio
			);
		}
	} else {
		for (let j = points.length - 2; j >= 0; j--) {
			const pt = points[j];
			if (lineType === LineType.WithSteps) {
				dc.ctx.lineTo(points[j + 1].x * dc.hRatio, pt.y2 * dc.vRatio);
			}
			dc.ctx.lineTo(pt.x * dc.hRatio, pt.y2 * dc.vRatio);
		}
	}
}

export class PaneRendererCloud extends BitmapCoordinatesPaneRenderer {
	private _data: PaneRendererCloudData | null = null;

	public setData(data: PaneRendererCloudData): void {
		this._data = data;
	}

	protected _drawImpl(renderingScope: BitmapCoordinatesRenderingScope): void {
		if (this._data === null) {
			return;
		}

		const { items, visibleRange, lineType } = this._data;
		if (visibleRange === null || items.length === 0 || visibleRange.to - visibleRange.from < 1) {
			return;
		}

		const dc: DrawContext = {
			ctx: renderingScope.context,
			hRatio: renderingScope.horizontalPixelRatio,
			vRatio: renderingScope.verticalPixelRatio,
		};

		this._drawFill(dc, items, visibleRange, lineType);

		if (this._data.lineVisible) {
			this._drawLines(dc, items, visibleRange, lineType);
		}
	}

	private _drawFill(
		dc: DrawContext,
		items: CloudItem[],
		visibleRange: SeriesItemsIndexesRange,
		lineType: LineType
	): void {
		const segments = buildSegments(items, visibleRange);

		for (const segment of segments) {
			if (segment.points.length < 2) {
				continue;
			}

			dc.ctx.beginPath();
			traceForward(dc, segment.points, lineType);
			traceBackward(dc, segment.points, lineType);
			dc.ctx.closePath();
			dc.ctx.fillStyle = findClosestItemColor(segment, items, visibleRange);
			dc.ctx.fill();
		}
	}

	private _drawLines(
		dc: DrawContext,
		items: CloudItem[],
		visibleRange: SeriesItemsIndexesRange,
		lineType: LineType
	): void {
		const data = this._data;
		if (data === null) {
			return;
		}

		dc.ctx.lineCap = 'butt';
		dc.ctx.lineJoin = 'round';
		dc.ctx.lineWidth = data.lineWidth * dc.vRatio;
		setLineStyle(dc.ctx, data.lineStyle);

		this._drawSingleLine(dc, items, visibleRange, lineType, 'y1', 'line1Color');
		this._drawSingleLine(dc, items, visibleRange, lineType, 'y2', 'line2Color');
	}

	private _drawSingleLine(
		dc: DrawContext,
		items: CloudItem[],
		visibleRange: SeriesItemsIndexesRange,
		lineType: LineType,
		yKey: 'y1' | 'y2',
		colorKey: 'line1Color' | 'line2Color'
	): void {
		let currentColor = items[visibleRange.from][colorKey];
		dc.ctx.beginPath();

		const firstItem = items[visibleRange.from];
		dc.ctx.moveTo(firstItem.x * dc.hRatio, firstItem[yKey] * dc.vRatio);

		for (let i = visibleRange.from + 1; i < visibleRange.to; i++) {
			const item = items[i];
			const itemColor = item[colorKey];

			if (itemColor !== currentColor) {
				dc.ctx.strokeStyle = currentColor;
				dc.ctx.stroke();
				dc.ctx.beginPath();
				const prevItem = items[i - 1];
				dc.ctx.moveTo(prevItem.x * dc.hRatio, prevItem[yKey] * dc.vRatio);
				currentColor = itemColor;
			}

			const currentX = item.x * dc.hRatio;
			const currentY = item[yKey] * dc.vRatio;

			switch (lineType) {
				case LineType.Simple:
					dc.ctx.lineTo(currentX, currentY);
					break;
				case LineType.WithSteps: {
					const prevItem = items[i - 1];
					dc.ctx.lineTo(currentX, prevItem[yKey] * dc.vRatio);
					dc.ctx.lineTo(currentX, currentY);
					break;
				}
				case LineType.Curved: {
					const linePoints = toLinePoints(
						items.map((it: CloudItem) => ({ x: it.x, y1: it[yKey], y2: it[yKey] })),
						'y1'
					);
					const [cp1, cp2] = getControlPoints(linePoints, i - 1, i);
					dc.ctx.bezierCurveTo(
						cp1.x * dc.hRatio, cp1.y * dc.vRatio,
						cp2.x * dc.hRatio, cp2.y * dc.vRatio,
						currentX, currentY
					);
					break;
				}
			}
		}

		dc.ctx.strokeStyle = currentColor;
		dc.ctx.stroke();
	}
}
