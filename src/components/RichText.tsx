import { Fragment, useMemo, type ReactNode } from 'react';
import { parseMarkdown, type Inline } from '@/lib/text';

export type BlurInline = Extract<Inline, { t: 'blur' }>;

/** Rendu Markdown léger. `renderBlur` personnalise l'affichage des termes {{...}} (Blur-Recall). */
export function RichText({
  text,
  renderBlur,
  className = '',
}: {
  text: string;
  renderBlur?: (tok: BlurInline) => ReactNode;
  className?: string;
}) {
  const { blocks } = useMemo(() => parseMarkdown(text), [text]);

  const renderInline = (inline: Inline[]) =>
    inline.map((tok, i) => {
      if (tok.t === 'blur') {
        return (
          <Fragment key={i}>
            {renderBlur ? (
              renderBlur(tok)
            ) : (
              <mark className="rounded bg-accent/10 px-0.5 font-medium text-inherit">{tok.v}</mark>
            )}
          </Fragment>
        );
      }
      return (
        <span key={i} className={`${tok.b ? 'font-semibold' : ''} ${tok.i ? 'italic' : ''}`}>
          {tok.v}
        </span>
      );
    });

  return (
    <div className={`text-[15px] leading-7 ${className}`}>
      {blocks.map((b, i) => {
        switch (b.type) {
          case 'h1':
            return (
              <h2 key={i} className="mb-2 mt-7 text-xl font-semibold tracking-tight first:mt-0">
                {renderInline(b.inline)}
              </h2>
            );
          case 'h2':
            return (
              <h3 key={i} className="mb-2 mt-6 text-lg font-semibold tracking-tight first:mt-0">
                {renderInline(b.inline)}
              </h3>
            );
          case 'h3':
            return (
              <h4 key={i} className="mb-1 mt-4 text-base font-semibold first:mt-0">
                {renderInline(b.inline)}
              </h4>
            );
          case 'li':
            return (
              <div key={i} className="flex gap-2.5 py-0.5" style={{ paddingLeft: (b.level ?? 0) * 20 }}>
                <span className="mt-[0.7em] h-1 w-1 shrink-0 rounded-full bg-muted" aria-hidden />
                <span>{renderInline(b.inline)}</span>
              </div>
            );
          case 'oli':
            return (
              <div key={i} className="flex gap-2.5 py-0.5" style={{ paddingLeft: (b.level ?? 0) * 20 }}>
                <span className="w-5 shrink-0 text-right tabular-nums text-muted">{b.num}.</span>
                <span>{renderInline(b.inline)}</span>
              </div>
            );
          case 'quote':
            return (
              <blockquote key={i} className="my-2 border-l-2 border-accent/50 pl-3 text-muted">
                {renderInline(b.inline)}
              </blockquote>
            );
          case 'hr':
            return <hr key={i} className="my-5 border-line" />;
          default:
            return (
              <p key={i} className="my-2.5">
                {renderInline(b.inline)}
              </p>
            );
        }
      })}
    </div>
  );
}
