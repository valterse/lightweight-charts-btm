import { undefinedIfNull } from '../../helpers/strict-type-checks';

import { BarPrice } from '../../model/bar';
import { IChartModelBase } from '../../model/chart-model';
import { Coordinate } from '../../model/coordinate';
import { ISeries } from '../../model/iseries';
import { PlotRowValueIndex } from '../../model/plot-data';
import { PriceScale } from '../../model/price-scale';
import { SeriesPlotRow } from '../../model/series-data';
import { ITimeScale } from '../../model/time-scale';
import { CloudItem, PaneRendererCloud } from '../../renderers/cloud-renderer';

import { SeriesPaneViewBase } from './series-pane-view-base';

export class SeriesCloudPaneView extends SeriesPaneViewBase<'Cloud', CloudItem, PaneRendererCloud> {
	protected readonly _renderer: PaneRendererCloud = new PaneRendererCloud();

	public constructor(series: ISeries<'Cloud'>, model: IChartModelBase) {
		super(series, model, true);
	}

	protected _fillRawPoints(): void {
		const colorer = this._series.barColorer();
		this._items = this._series.conflatedBars().rows().map((row: SeriesPlotRow<'Cloud'>) => {
			const barStyle = colorer.barStyle(row.index);

			return {
				time: row.index,
				x: NaN as Coordinate,
				y1: NaN as Coordinate,
				y2: NaN as Coordinate,
				topColor: barStyle.topColor,
				bottomColor: barStyle.bottomColor,
				line1Color: barStyle.line1Color,
				line2Color: barStyle.line2Color,
			};
		});
	}

	protected _convertToCoordinates(priceScale: PriceScale, timeScale: ITimeScale, firstValue: number): void {
		timeScale.indexesToCoordinates(this._items, undefinedIfNull(this._itemsVisibleRange));

		// Convert both price values to coordinates manually
		const visibleRange = this._itemsVisibleRange;
		const rows = this._series.conflatedBars().rows();
		const fromIndex = visibleRange === null ? 0 : visibleRange.from;
		const toIndex = visibleRange === null ? this._items.length : visibleRange.to;

		for (let i = fromIndex; i < toIndex; i++) {
			const row = rows[i];
			const item = this._items[i];
			const price1 = row.value[PlotRowValueIndex.Open] as BarPrice;
			const price2 = row.value[PlotRowValueIndex.Close] as BarPrice;

			item.y1 = priceScale.priceToCoordinate(price1, firstValue);
			item.y2 = priceScale.priceToCoordinate(price2, firstValue);
		}
	}

	protected _prepareRendererData(): void {
		const options = this._series.options();

		if (this._itemsVisibleRange === null || this._items.length === 0) {
			return;
		}

		this._renderer.setData({
			items: this._items,
			visibleRange: this._itemsVisibleRange,
			barWidth: this._model.timeScale().barSpacing(),
			lineType: options.lineType,
			lineWidth: options.lineWidth,
			lineStyle: options.lineStyle,
			lineVisible: options.lineVisible,
		});
	}
}
