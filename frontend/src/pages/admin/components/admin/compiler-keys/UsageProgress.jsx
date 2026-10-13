const UsageProgress = ({ usagePercentage = 0, currentRequestCount = 0, maxRequestLimit = 0 }) => {
  const safePercentage = Math.min(100, Math.max(0, parseFloat(usagePercentage) || 0));
  return (
    <div className="compiler-usage-progress">
      <div className="compiler-usage-meta">
        <span className="compiler-usage-percentage">{safePercentage.toFixed(2)}%</span>
        <span className="compiler-usage-text">
          {currentRequestCount.toLocaleString()} / {maxRequestLimit.toLocaleString()}
        </span>
      </div>
      <div className="compiler-usage-bar-track">
        <div
          className="compiler-usage-bar-fill"
          style={{ width: `${safePercentage}%` }}
        />
      </div>
    </div>
  );
};

export default UsageProgress;
