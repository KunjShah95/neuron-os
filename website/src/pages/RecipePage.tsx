import { Link, useParams } from "react-router-dom"
import { getRecipeBySlug, recipeDocs } from "../content/docs"
import ArticleRenderer from "../components/ArticleRenderer"
import NotFound from "./NotFound"

export default function RecipePage() {
  const { slug } = useParams()
  const recipe = getRecipeBySlug(slug ?? "")

  if (!recipe) return <NotFound />

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
            <span className="font-mono text-[10px] tracking-widest text-amber-400">
              {recipe.category.toUpperCase()}
            </span>
            <span className="text-neutral-700">·</span>
            <span className="font-mono text-[10px] text-neutral-500">{recipe.readTime}</span>
          </div>

          <h1
            className="text-3xl md:text-4xl font-medium text-white tracking-tight leading-[1.15] mb-5"
            style={{ letterSpacing: "-0.02em" }}
          >
            {recipe.title}
          </h1>

          <p className="text-lg text-neutral-400 leading-relaxed">
            {recipe.description}
          </p>
        </header>

        <ArticleRenderer blocks={recipe.body} />

        <footer className="mt-20 pt-10 border-t border-white/[0.06]">
          <div className="text-xs text-neutral-500 font-mono mb-4">MORE RECIPES</div>
          <div className="grid sm:grid-cols-2 gap-3">
            {recipeDocs
              .filter((r) => r.slug !== recipe.slug)
              .map((r) => (
                <Link
                  key={r.slug}
                  to={`/docs/recipes/${r.slug}`}
                  className="bento-card p-4 hover:bg-white/[0.02] group block"
                >
                  <div className="text-sm text-white group-hover:text-blue-400 transition-colors">
                    {r.title}
                  </div>
                  <div className="text-xs text-neutral-500 mt-1">{r.readTime}</div>
                </Link>
              ))}
          </div>
        </footer>
      </article>
    </div>
  )
}
