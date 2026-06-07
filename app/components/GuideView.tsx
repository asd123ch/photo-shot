import React from 'react';
import {
  MODELS, modelsByProvider, getProviderLabel, formatCost,
  PROVIDERS, Provider, ModelDef,
} from '../services/registry';
import { Sparkles, BookOpen, Layers } from 'lucide-react';

// Everything on this page is derived from the model registry, so it always
// matches what the Editor actually offers.

const inputLabel = (m: ModelDef): string =>
  m.input === 'text' ? 'Text → image' : m.input === 'edit' ? 'Photo edit' : 'Text or photo';

const resLabel = (m: ModelDef): string =>
  m.resolutions.length ? m.resolutions.join(' / ') : m.baseLongEdge ? '~2K' : 'Auto';

const priceLabel = (m: ModelDef): string =>
  formatCost(m, { resolution: m.defaultResolution, quality: m.extras?.quality?.default }) || '—';

const extrasOf = (m: ModelDef): string[] => {
  const x: string[] = [];
  if (m.flex) x.push('FLEX');
  if (m.extras?.quality) x.push('Quality');
  if (m.extras?.webSearch) x.push('Web search');
  if (m.extras?.imageSearch) x.push('Image search');
  return x;
};

const imagesLabel = (m: ModelDef): string | null =>
  m.maxImages <= 0 ? null : m.maxImages === 1 ? '1 photo' : `up to ${m.maxImages} photos`;

const CONCEPTS: { term: string; desc: string }[] = [
  { term: 'Providers', desc: 'Gemini, WaveSpeed and OpenRouter each offer their own set of models. The same model can exist on more than one provider with small differences.' },
  { term: 'Input', desc: 'Photo edit needs a reference image. Text or photo can do both: edit an image or generate one from a prompt.' },
  { term: 'Resolution', desc: '2K or 4K output where supported. Higher means more detail and a bit more cost; a few models go up to 8K.' },
  { term: 'Ratio', desc: 'The aspect ratio of the result. "Auto" matches your reference photo.' },
  { term: 'FLEX', desc: 'OpenRouter only. Runs about 50% cheaper in exchange for slower processing.' },
  { term: 'Web / Image search', desc: 'Some Nano Banana models can look up the real web or images for accurate logos, places and text. Adds about $0.014.' },
  { term: 'Quality', desc: 'GPT Image lets you pick low, medium or high. Higher looks better and costs more.' },
  { term: 'Ultra / Fast', desc: 'Variants of a model. Ultra reaches the highest resolution (4K or 8K); Fast trades a little quality for speed and price.' },
];

const PROVIDER_BLURB: Record<Provider, string> = {
  gemini: "Google's Nano Banana models, called directly. Reliable all-round editing with precise 2K and 4K control.",
  wavespeed: 'A large marketplace: Seedream, several Nano Banana variants, GPT Image and Grok. The widest choice, plus 4K and 8K options.',
  openrouter: 'One balance routed to Gemini, GPT Image and Seedream. Adds the FLEX option for cheaper, slower runs.',
};

const ProviderTable: React.FC<{ provider: Provider }> = ({ provider }) => {
  const list = modelsByProvider(provider);
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-base font-bold text-white">{getProviderLabel(provider)}</h3>
        <span className="text-[10px] text-gray-400 uppercase tracking-wider whitespace-nowrap">
          {list.length} {list.length === 1 ? 'model' : 'models'}
        </span>
      </div>
      <p className="text-xs text-gray-400 leading-relaxed">{PROVIDER_BLURB[provider]}</p>
      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-gray-400">
              <th className="font-semibold pb-2 pr-2">Model</th>
              <th className="font-semibold pb-2 px-1">Input</th>
              <th className="font-semibold pb-2 px-1">Res</th>
              <th className="font-semibold pb-2 pl-1 text-right">~ Price</th>
            </tr>
          </thead>
          <tbody className="align-top">
            {list.map((m) => {
              const extras = extrasOf(m);
              const imgs = imagesLabel(m);
              return (
                <tr key={m.key} className="border-t border-white/5">
                  <td className="py-2.5 pr-2">
                    <div className="font-semibold text-gray-100 text-[13px] leading-tight">{m.label}</div>
                    {(imgs || extras.length > 0) && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {imgs && (
                          <span className="text-[9px] font-bold text-gray-300 bg-white/5 px-1.5 py-0.5 rounded">{imgs}</span>
                        )}
                        {extras.map((e) => (
                          <span key={e} className="text-[9px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">{e}</span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="py-2.5 px-1 text-[11px] text-gray-400">{inputLabel(m)}</td>
                  <td className="py-2.5 px-1 text-[11px] text-gray-400 tabular-nums whitespace-nowrap">{resLabel(m)}</td>
                  <td className="py-2.5 pl-1 text-[11px] text-success font-bold tabular-nums text-right whitespace-nowrap">{priceLabel(m)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
};

const GuideView: React.FC = () => (
  <div className="space-y-9 animate-fade-in">
    <header className="space-y-3">
      <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
        <BookOpen size={22} className="text-primary" aria-hidden="true" /> Guide
      </h2>
      <p className="text-sm text-gray-400 leading-relaxed">
        Photo-Shot puts three AI providers behind one screen. In the <strong className="text-gray-200">Editor</strong> you
        edit a photo with a prompt or generate a new image from text. In <strong className="text-gray-200">Metadata</strong> you
        copy EXIF, GPS and time from one photo onto another. Pick a provider, then a model: each one supports different
        sizes, ratios and extras. Here is the full overview.
      </p>
      <p className="text-xs text-gray-400 flex items-center gap-1.5">
        <Layers size={13} aria-hidden="true" /> {MODELS.length} models across {PROVIDERS.length} providers.
      </p>
    </header>

    <section className="space-y-3">
      <h3 className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-2">
        <Sparkles size={13} aria-hidden="true" /> Key concepts
      </h3>
      <dl className="space-y-3">
        {CONCEPTS.map((c) => (
          <div key={c.term} className="flex gap-3">
            <dt className="w-24 flex-shrink-0 text-[13px] font-bold text-gray-200">{c.term}</dt>
            <dd className="flex-1 text-xs text-gray-400 leading-relaxed">{c.desc}</dd>
          </div>
        ))}
      </dl>
    </section>

    {PROVIDERS.map((p) => <ProviderTable key={p} provider={p} />)}

    <section className="space-y-2 border-t border-white/5 pt-5 text-xs text-gray-400 leading-relaxed">
      <p><strong className="text-gray-300">Input</strong> shows what a model accepts: "Photo edit" needs a reference image, "Text or photo" does both.</p>
      <p><strong className="text-gray-300">Price</strong> is a rough estimate per image at default settings. Picking 4K, a higher Quality or a search option adds to it; FLEX roughly halves it.</p>
    </section>
  </div>
);

export default GuideView;
