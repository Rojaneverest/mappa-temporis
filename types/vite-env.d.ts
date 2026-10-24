// Vite replaces import.meta.env.BASE_URL at build time: "/" locally, "/mappa-temporis/" on GitHub Pages.
interface ImportMeta {
  readonly env: { readonly BASE_URL: string };
}
