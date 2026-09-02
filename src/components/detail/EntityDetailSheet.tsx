import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useT } from "../../i18n";
import { wash, tintInk, edge } from "../../lib/colors";
import { Icon } from "../Icon";
import { Sheet } from "../Sheet";
import { ActionMenu } from "../ActionMenu";
import { Avatar } from "../Avatar";
import { AvatarStack } from "../AvatarStack";
import { ZoomableImg } from "../ZoomableImg";
import type { DetailAction, DetailBlock, DetailModel } from "../../lib/detail";

// The generalized "entity detail" peek: one calm bottom sheet that renders any
// DetailModel (lib/detail) — a quick picture, a date, the relevant text, the face
// it belongs to, and a couple of smart actions. Opened from any board/kitchen row
// through useEntityDetail (DetailProvider). Same sheet stack as AddSheet (useModal
// + useSwipeToDismiss), so Esc / scrim-tap / swipe-down all close it.
//
// Always mounted; `model` toggles the `.show` slide. We retain the LAST model
// while closing so the content doesn't blink away mid-animation.
export function EntityDetailSheet({
  model,
  onClose,
}: {
  model: DetailModel | null;
  onClose: () => void;
}) {
  const t = useT();
  const nav = useNavigate();
  const open = !!model;

  // Keep showing the last model through the slide-out (model goes null on close).
  const [shown, setShown] = useState<DetailModel | null>(model);
  useEffect(() => {
    if (model) setShown(model);
  }, [model]);
  const m = model ?? shown;

  // Any action closes the peek first, then runs / navigates.
  const runAction = (a: DetailAction) => {
    onClose();
    a.run?.();
    if (a.href) nav(a.href);
  };

  // The long tail of actions (adapters flag them `overflow`) folds into a ⋯ in
  // the sheet's head corner, beside the ✕ — a drop-DOWN, deliberately: `.sheet`
  // is the scroll container, so a drop-up from the footer row would hard-clip on
  // a short peek, while downward overflow just scrolls (and useModal's focus
  // pull brings the panel into view). Danger rows keep the RecipeSheet grammar
  // (warn tone + a divider above). Zero overflow actions → the menu hides
  // itself, so guest/toddler peeks (whose callers omit the gated opts) stay
  // ⋯-free with no extra wiring.
  const folded = (m?.actions ?? []).filter((a) => a.overflow);
  const menu = folded.length > 0 && (
    <ActionMenu
      items={folded.map((a) => ({
        icon: a.icon,
        label: a.label,
        tone: a.tone,
        separated: a.tone === "danger",
        onSelect: () => runAction(a),
      }))}
    />
  );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      ariaLabel={m?.title ?? t.detail.aria}
      className="detail-sheet"
      action={menu || undefined}
    >
      {m && <DetailBody model={m} onAction={runAction} />}
    </Sheet>
  );
}

function DetailBody({
  model,
  onAction,
}: {
  model: DetailModel;
  onAction: (a: DetailAction) => void;
}) {
  // wash()/tintInk() need a concrete hex (string concat) — builders always set a
  // hex accent; this fallback just keeps them valid if one ever doesn't.
  const accent = model.accent ?? "#9b8d7d";
  return (
    <div className="detail-sheet__body">
      <div className="detail-sheet__head">
        <span
          className="detail-sheet__spine"
          style={{ background: accent }}
          aria-hidden="true"
        />
        {model.photo ? (
          <ZoomableImg
            src={model.photo}
            className="detail-sheet__photo"
            alt={model.title}
          />
        ) : (
          <span
            className="detail-sheet__tile"
            style={{ background: wash(accent) }}
            aria-hidden="true"
          >
            {model.emoji ? (
              <span className="detail-sheet__emoji">{model.emoji}</span>
            ) : (
              model.icon && <Icon name={model.icon} size={34} color={accent} />
            )}
          </span>
        )}
        <div className="detail-sheet__heading">
          {model.when && (
            <span className="detail-sheet__when mono">{model.when}</span>
          )}
          <h3
            className="detail-sheet__title"
            style={{ color: tintInk(accent) }}
          >
            {model.title}
          </h3>
          {model.whoLabel && (
            <span className="detail-sheet__sub">{model.whoLabel}</span>
          )}
          {model.whoStack && model.whoStack.length > 0 ? (
            // « Qui » — several people share this (a rendez-vous for two kids). A face
            // stack + their names, no single subject (calm: faces, never a count).
            <span className="detail-sheet__who">
              <AvatarStack
                faces={model.whoStack.map((w) => ({
                  kind: w.avatarKind,
                  photo: w.avatarRef,
                  colour: w.colour,
                  name: w.name,
                }))}
                size={26}
              />
              <span>
                {model.whoStack
                  .map((w) => w.name)
                  .filter(Boolean)
                  .join(", ")}
              </span>
            </span>
          ) : model.who ? (
            <span className="detail-sheet__who">
              <Avatar
                kind={model.who.avatarKind}
                photo={model.who.avatarRef}
                colour={model.who.colour}
                name={model.who.name}
                size={26}
              />
              <span>
                {model.who.role ? `${model.who.role} ` : ""}
                {model.who.name}
              </span>
            </span>
          ) : null}
        </div>
      </div>

      {model.blocks?.map((b, i) => (
        <Block key={i} block={b} onAction={onAction} />
      ))}

      {/* Visible row = the quick-reach actions + the one primary; the `overflow`
          ones render in the head ⋯ instead (EntityDetailSheet above). */}
      {model.actions && model.actions.some((a) => !a.overflow) && (
        <div className="detail-sheet__actions">
          {model.actions
            .filter((a) => !a.overflow)
            .map((a) => (
              <button
                key={a.key}
                type="button"
                className={
                  "btn" +
                  (a.primary ? " btn--primary" : "") +
                  (a.tone === "danger" ? " btn--danger" : "")
                }
                onClick={() => onAction(a)}
              >
                {a.icon && <Icon name={a.icon} size={18} />}
                {a.label}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

function Block({
  block,
  onAction,
}: {
  block: DetailBlock;
  onAction: (a: DetailAction) => void;
}) {
  switch (block.kind) {
    case "text":
      // `label` names where the words came from when that isn't obvious — a voice
      // mot's machine transcript wears « Ce qui a été dit » so it never reads as
      // something the sender typed. Same quiet blocklabel the chip rows use.
      return (
        <>
          {block.label && (
            <span className="detail-sheet__blocklabel mono">{block.label}</span>
          )}
          <p
            className={
              "detail-sheet__text" +
              (block.hand ? " detail-sheet__text--hand" : "")
            }
          >
            {block.text}
          </p>
        </>
      );
    case "chips":
      return (
        <div className="detail-sheet__chips">
          {block.label && (
            <span className="detail-sheet__blocklabel mono">{block.label}</span>
          )}
          <span className="detail-sheet__chiprow">
            {block.chips.map((c, i) => {
              // A per-chip household tag colour (recipe peek) tints it the SAME way
              // RecipeSheet/RecipesTab do; absent → the default berry chip.
              const hex = block.tones?.[i];
              return (
                <span
                  key={i}
                  className="chip"
                  style={
                    hex
                      ? {
                          background: wash(hex),
                          color: tintInk(hex),
                          borderColor: edge(hex),
                        }
                      : undefined
                  }
                >
                  {c}
                </span>
              );
            })}
          </span>
        </div>
      );
    case "list":
      return (
        <div className="detail-sheet__listwrap">
          {block.label && (
            <span className="detail-sheet__blocklabel mono">{block.label}</span>
          )}
          <ul className="detail-sheet__list">
            {block.items.map((it, i) => {
              // A plain string stays plain text. A DetailListRow adds the small
              // glyph doors (a day peek's meal: 📖 recette · 🍲 Cuisiner) — same
              // runAction path as the footer, so the peek closes then navigates.
              const row = typeof it === "string" ? { text: it } : it;
              if (!row.actions?.length) return <li key={i}>{row.text}</li>;
              return (
                <li key={i} className="detail-sheet__listrow">
                  {/* The flex lives on an INNER span: flexing the <li> itself drops
                      its display:list-item, so a door-row would silently lose the
                      bullet that every plain row keeps. */}
                  <span className="detail-sheet__listline">
                    <span className="detail-sheet__listtext">{row.text}</span>
                    <span className="detail-sheet__listctl">
                      {row.actions.map((a) => (
                        <button
                          key={a.key}
                          type="button"
                          className="detail-sheet__listbtn"
                          onClick={() => onAction(a)}
                          aria-label={a.label}
                          title={a.label}
                        >
                          {a.icon && <Icon name={a.icon} size={16} />}
                        </button>
                      ))}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      );
    case "image":
      return (
        <ZoomableImg
          src={block.src}
          alt={block.alt ?? ""}
          className="detail-sheet__img"
        />
      );
    case "audio":
      // eslint-disable-next-line jsx-a11y/media-has-caption -- a personal memo, no caption track
      return <audio className="detail-sheet__audio" controls src={block.src} />;
    case "togglechips":
      return <ToggleChips block={block} />;
  }
}

// Tappable membership chips (a person's named groups): toggles optimistically and
// fires onToggle to persist. Stays interactive while the peek is open; on reopen it
// reflects the refetched truth.
function ToggleChips({
  block,
}: {
  block: Extract<DetailBlock, { kind: "togglechips" }>;
}) {
  const [on, setOn] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(block.options.map((o) => [o.id, o.on])),
  );
  return (
    <div className="detail-sheet__chips">
      {block.label && (
        <span className="detail-sheet__blocklabel mono">{block.label}</span>
      )}
      <span className="detail-sheet__chiprow">
        {block.options.map((o) => {
          const active = on[o.id];
          return (
            <button
              key={o.id}
              type="button"
              className={"chip chip--toggle" + (active ? " is-on" : "")}
              aria-pressed={active}
              onClick={() => {
                const next = !active;
                setOn((s) => ({ ...s, [o.id]: next }));
                block.onToggle(o.id, next);
              }}
            >
              <Icon name={active ? "check-bold" : "plus-bold"} size={11} />{" "}
              {o.label}
            </button>
          );
        })}
      </span>
    </div>
  );
}
