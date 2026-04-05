import { LineStyle, LineType } from '../../renderers/draw-line';
import { IUpdatablePaneView } from '../../views/pane/iupdatable-pane-view';

import { IChartModelBase } from '../chart-model';
import { ISeries } from '../iseries';
import { CloudStyleOptions, LastPriceAnimationMode } from '../series-options';
import { SeriesCloudPaneView } from './cloud-pane-view';
import { SeriesDefinition, SeriesDefinitionInternal } from './series-def';

export const cloudStyleDefaults: CloudStyleOptions = {
	topColor: 'rgba(76, 175, 80, 0.3)',
	bottomColor: 'rgba(255, 82, 82, 0.3)',
	line1Color: 'rgba(76, 175, 80, 1)',
	line2Color: 'rgba(255, 82, 82, 1)',
	lineWidth: 1,
	lineStyle: LineStyle.Solid,
	lineType: LineType.Simple,
	lineVisible: true,
	crosshairMarkerVisible: true,
	crosshairMarkerRadius: 4,
	crosshairMarkerBorderColor: '',
	crosshairMarkerBorderWidth: 2,
	crosshairMarkerBackgroundColor: '',
	lastPriceAnimation: LastPriceAnimationMode.Disabled,
};
const createPaneView = (series: ISeries<'Cloud'>, model: IChartModelBase): IUpdatablePaneView => new SeriesCloudPaneView(series, model);

export const createSeries = (): SeriesDefinition<'Cloud'> => {
	const definition: SeriesDefinitionInternal<'Cloud'> = {
		type: 'Cloud',
		isBuiltIn: true as const,
		defaultOptions: cloudStyleDefaults,
		/**
		 * @internal
		 */
		createPaneView: createPaneView,
	};
	return definition as SeriesDefinition<'Cloud'>;
};
export const cloudSeries: SeriesDefinition<'Cloud'> = createSeries();
