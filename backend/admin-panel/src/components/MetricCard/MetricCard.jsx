import InfoTip from '../InfoTip/InfoTip.jsx';
import { STATUS_LABELS } from '../../utils/metricStatus.js';

export default function MetricCard({
  label,
  value,
  tooltip,
  status = 'neutral',
  onEdit,
  editLabel = 'Alterar'
}) {
  const statusLabel = STATUS_LABELS[status];

  return (
    <div className={`fin-metric-card fin-metric-${status}`}>
      <div className="fin-metric-header">
        <span className="fin-metric-label">{label}</span>
        {tooltip && <InfoTip text={tooltip} />}
      </div>
      <strong className="fin-metric-value">{value}</strong>
      {statusLabel && <span className={`fin-metric-status fin-metric-status-${status}`}>{statusLabel}</span>}
      {onEdit && (
        <button type="button" className="fin-edit-btn" onClick={onEdit}>
          {editLabel}
        </button>
      )}
    </div>
  );
}
