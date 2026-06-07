import { Link, useParams } from "react-router-dom"
import { docs, getDocBySlug } from "../content/docs"
import ArticleRenderer from "../components/ArticleRenderer"
import NotFound from "./NotFound"

export default function DocPage() {
  const { slug } = useParams()
  const doc = getDocBySlug(slug ?? "")

  if (!doc) return <NotFound />

  return (
    <div className="max-w-3xl mx-auto px-6">
      <Link
        to="/docs"
        className="inline-flex items-center gap-2 text-xs text-neutral-500 hover:text-white transition-colors font-mono mb-12"
      >
        <span>←</span>
        <span>back to docs</span>
      </Link>

      <article>
        <header className="mb-16">
          <div className="flex items-center gap-3 mb-6">
            <span className="font-mono text-[10px] tracking-widest text-blue-400">
              {doc.category.toUpperCase()}
            </span>
            <span className="text-neutral-700">·</span>
            <span className="font-mono text-[10px] text-neutral-500">{doc.readTime}</span>
          </div>

          <h1
            className="text-3xl md:text-4xl font-medium text-white tracking-tight leading-[1.15] mb-5"
            style={{ letterSpacing: "-0.02em" }}
          >
            {doc.title}
          </h1>

          <p className="text-lg text-neutral-400 leading-relaxed">
            {doc.description}
          </p>
        </header>

        <ArticleRenderer blocks={doc.body} />

        <footer className="mt-20 pt-10 border-t border-white/[0.06]">
          <div className="text-xs text-neutral-500 font-mono mb-4">RELATED</div>
          <div className="grid sm:grid-cols-2 gap-3">
            {docs
              .filter((d) => d.slug !== doc.slug)
              .map((d) => (
                <Link
                  key={d.slug}
                  to={`/docs/${d.slug}`}
                  className="bento-card p-4 hover:bg-white/[0.02] group block"
                >
                  <div className="text-sm text-white group-hover:text-blue-400 transition-colors">
                    {d.title}
                  </div>
                  <div className="text-xs text-neutral-500 mt-1">{d.readTime}</div>
                </Link>
              ))}
          </div>
        </footer>
      </article>
    </div>
  )
}
