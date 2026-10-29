import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { LegalTextFormat } from '@iwana/shared';

export function LegalTextContent({
  content,
  format,
}: {
  content: string;
  format: LegalTextFormat;
}) {
  if (format === 'PLAIN') return <div className="whitespace-pre-wrap">{content}</div>;
  return (
    <div className="min-w-0 overflow-x-auto text-sm">
      <ReactMarkdown
        skipHtml
        remarkPlugins={[remarkGfm]}
        allowedElements={[
          'h1',
          'h2',
          'h3',
          'p',
          'ul',
          'ol',
          'li',
          'table',
          'thead',
          'tbody',
          'tr',
          'th',
          'td',
          'strong',
          'em',
          'a',
        ]}
        urlTransform={(url) => (/^https?:\/\//i.test(url) ? url : '')}
        components={{
          a: ({ children, href }) =>
            href ? (
              <a href={href} target="_blank" rel="noopener noreferrer" className="underline">
                {children}
              </a>
            ) : (
              <>{children}</>
            ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
