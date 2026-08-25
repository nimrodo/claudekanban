import type { JSX } from "react";
import type { SessionDto } from "../lib/transport/Transport.js";
import { TimelineIcon } from "../detail/TimelineIcon.js";
import { handleActivateKey } from "./Card.js";

export function SubagentChips({
  children,
  onSelect,
  max = 3,
}: {
  children: SessionDto[];
  onSelect: (id: string) => void;
  max?: number;
}): JSX.Element | null {
  if (children.length === 0) {
    return null;
  }

  const shown = children.slice(0, max);
  const overflow = children.length - shown.length;

  return (
    <div className="subagent-chips">
      {shown.map((child) => (
        <div
          key={child.id}
          className="subagent-chip"
          data-status={child.status}
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(child.id);
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            handleActivateKey(e, () => onSelect(child.id));
          }}
        >
          <TimelineIcon kind="spawn" />
          <span className="subagent-chip-label">{child.owner}</span>
        </div>
      ))}
      {overflow > 0 && <div className="subagent-chip subagent-chip-overflow">+{overflow} more</div>}
    </div>
  );
}
