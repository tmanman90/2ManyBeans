import { ruphusCaption } from '../../lib/ruphus/captions';
export function RuphusLifecycleCaption({ frame }) { return <div role="status" data-ruphus-lifecycle-caption="true">{ruphusCaption(frame)}</div>; }
