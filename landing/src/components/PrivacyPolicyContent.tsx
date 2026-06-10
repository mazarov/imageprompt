import type { ReactNode } from "react";
import {
  CONTACT_EMAIL,
  EXTENSION_PRIVACY_INTRO,
  EXTENSION_PRIVACY_SECTIONS,
  LAST_UPDATED,
  type PrivacyBlock,
} from "@/content/extension-privacy-policy";

const EMAIL_RE = new RegExp(CONTACT_EMAIL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");

function renderTextWithEmailLinks(text: string) {
  const parts = text.split(EMAIL_RE);
  if (parts.length === 1) return text;

  const nodes: ReactNode[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (parts[i]) nodes.push(parts[i]);
    if (i < parts.length - 1) {
      nodes.push(
        <a
          key={`mail-${i}`}
          href={`mailto:${CONTACT_EMAIL}`}
          className="text-indigo-400 underline hover:text-indigo-300"
        >
          {CONTACT_EMAIL}
        </a>
      );
    }
  }
  return nodes;
}

function PrivacyBlockView({ block }: { block: PrivacyBlock }) {
  if (block.type === "h3") {
    return <h3 className="mt-4 text-base font-semibold text-zinc-100">{block.text}</h3>;
  }

  if (block.type === "ul") {
    return (
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {block.items.map((item) => (
          <li key={item}>{renderTextWithEmailLinks(item)}</li>
        ))}
      </ul>
    );
  }

  return <p className="mt-2">{renderTextWithEmailLinks(block.text)}</p>;
}

function blockKey(block: PrivacyBlock, index: number) {
  if (block.type === "ul") return `ul-${index}-${block.items[0]?.slice(0, 32) ?? index}`;
  return `${block.type}-${index}-${block.text.slice(0, 32)}`;
}

export function PrivacyPolicyContent() {
  return (
    <>
      <p className="mt-2 text-sm text-zinc-400">Last Updated: {LAST_UPDATED}.</p>

      <div className="mt-10 space-y-8 text-[15px] leading-relaxed text-zinc-300">
        <section>
          {EXTENSION_PRIVACY_INTRO.map((block, index) => (
            <PrivacyBlockView key={blockKey(block, index)} block={block} />
          ))}
        </section>

        {EXTENSION_PRIVACY_SECTIONS.map((section) => (
          <section key={section.heading}>
            {section.heading ? (
              <h2 className="text-lg font-semibold text-zinc-100">{section.heading}</h2>
            ) : null}
            {section.blocks.map((block, index) => (
              <PrivacyBlockView
                key={`${section.heading}-${blockKey(block, index)}`}
                block={block}
              />
            ))}
          </section>
        ))}
      </div>
    </>
  );
}
