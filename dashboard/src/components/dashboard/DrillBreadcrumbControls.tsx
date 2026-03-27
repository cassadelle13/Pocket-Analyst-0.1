"use client";

type DrillBreadcrumbControlsProps = {
  activePath: string[];
  canDrillUp: boolean;
  canDrillDown: boolean;
  onDrillUp: () => void;
  onDrillDown: () => void;
};

export function DrillBreadcrumbControls(props: DrillBreadcrumbControlsProps) {
  const { activePath, canDrillUp, canDrillDown, onDrillUp, onDrillDown } = props;
  return (
    <div className="absolute top-2 left-2 z-10 flex items-center gap-2 rounded-md bg-black/45 px-2 py-1 text-[11px] text-slate-100 backdrop-blur">
      <button
        type="button"
        className="rounded border border-white/20 px-2 py-0.5 disabled:opacity-40"
        onClick={onDrillUp}
        disabled={!canDrillUp}
        title="Drill up"
      >
        Up
      </button>
      <button
        type="button"
        className="rounded border border-white/20 px-2 py-0.5 disabled:opacity-40"
        onClick={onDrillDown}
        disabled={!canDrillDown}
        title="Drill down"
      >
        Down
      </button>
      <span className="opacity-80">
        {activePath.length > 0 ? activePath.join(" > ") : "Top level"}
      </span>
    </div>
  );
}
