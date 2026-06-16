export default function InfoTip({ text }) {
  return (
    <span className="info-tip">
      <button type="button" className="info-tip-trigger" aria-label="Para que serve este dado">
        ?
      </button>
      <span className="info-tip-popover" role="tooltip">
        {text}
      </span>
    </span>
  );
}
