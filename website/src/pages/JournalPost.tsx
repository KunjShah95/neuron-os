import { Link, useParams } from "react-router-dom"
import { getPostBySlug, posts } from "../content/posts"
import ArticleRenderer from "../components/ArticleRenderer"
import NotFound from "./NotFound"

export default function JournalPost() {
  const { slug } = useParams()
  const post = getPostBySlug(slug ?? "")

  if (!post) return <NotFound />

  const currentIdx = posts.findIndex((p) => p.slug === post.slug)
  const next = posts[(currentIdx + 1) % posts.length]

  return (
    <div className="max-w-3xl mx-auto px-6">
      <Link
        to="/#journal"
        className="inline-flex items-center gap-2 text-xs text-neutral-500 hover:text-white transition-colors font-mono mb-12"
      >
        <span>←</span>
        <span>back to journal</span>
      </Link>

      <article>
        <header className="mb-16">
          <div className="flex items-center gap-3 mb-6">
            <span className="font-mono text-[10px] tracking-widest text-blue-400">
              ENTRY {post.number}
            </span>
            <span className="text-neutral-700">·</span>
            <span className="font-mono text-[10px] text-neutral-500">{post.date}</span>
            <span className="text-neutral-700">·</span>
            <span className="font-mono text-[10px] text-neutral-500">{post.readTime} read</span>
          </div>

          <h1
            className="text-4xl md:text-5xl font-medium text-white tracking-tight leading-[1.1] mb-6"
            style={{ letterSpacing: "-0.03em" }}
          >
            {post.title}
          </h1>

          <p className="text-lg text-neutral-400 leading-relaxed mb-8">
            {post.excerpt}
          </p>

          <div className="flex items-center gap-3 pb-8 border-b border-white/[0.06]">
            <div
              className="w-10 h-10 rounded-full border border-white/[0.1] flex items-center justify-center font-mono text-xs text-neutral-300"
              style={{
                background: `linear-gradient(135deg, hsl(${
                  (parseInt(post.number) * 73) % 360
                }, 30%, 22%), #0A0A0A)`,
              }}
            >
              {post.author
                .split(" ")
                .map((s) => s[0])
                .join("")}
            </div>
            <div>
              <div className="text-sm text-white">{post.author}</div>
              <div className="text-xs text-neutral-500">{post.authorRole}</div>
            </div>
          </div>
        </header>

        <ArticleRenderer blocks={post.body} />

        <footer className="mt-24 pt-12 border-t border-white/[0.06]">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            <div>
              <div className="text-xs text-neutral-500 font-mono mb-2">NEXT ENTRY</div>
              <Link
                to={`/journal/${next.slug}`}
                className="text-lg text-white hover:text-blue-400 transition-colors"
              >
                {next.title} →
              </Link>
            </div>
            <Link
              to="/#journal"
              className="text-sm text-neutral-400 hover:text-white transition-colors font-mono"
            >
              all entries
            </Link>
          </div>
        </footer>
      </article>
    </div>
  )
}
