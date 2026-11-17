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
  // HTML (plantilla de contrato) se muestra como código fuente escapado: nunca se inyecta en el DOM.
  if (format === 'PLAIN' || format === 'HTML')
    return <div className="whitespace-pre-wrap break-words">{content}</div>;
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
          // El texto legal vive dentro de paneles que ya tienen su propio título: sus encabezados
          // bajan tres niveles para no romper la jerarquía de la página (h1 → h4).
          h1: ({ children }) => (
            <h4 className="mt-3 text-sm font-semibold first:mt-0">{children}</h4>
          ),
          h2: ({ children }) => <h5 className="mt-3 text-sm font-semibold">{children}</h5>,
          h3: ({ children }) => <h6 className="mt-2 text-sm font-medium">{children}</h6>,
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
