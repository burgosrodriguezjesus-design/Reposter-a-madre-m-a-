import { BadgeCheck, Quote } from "lucide-react";
import type { Review } from "@prisma/client";
import { DemoBadge, Stars } from "@/components/site/ui";

export function ReviewCard({ review }: { review: Review }) {
  return (
    <figure className="reveal card relative flex h-full flex-col p-6">
      <Quote className="absolute top-5 right-5 size-8 text-blush-200" aria-hidden />
      <Stars rating={review.rating} />
      <blockquote className="mt-3 flex-1 text-[15px] leading-relaxed text-cocoa-700">“{review.text}”</blockquote>
      <figcaption className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold text-cocoa-900">{review.authorName}</span>
        {review.verified && (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
            <BadgeCheck className="size-3.5" /> Pedido verificado
          </span>
        )}
        {review.isDemo && <DemoBadge />}
      </figcaption>
      {review.reply && (
        <p className="mt-3 rounded-2xl bg-cream-100 p-3 text-sm text-cocoa-600">
          <strong className="text-cocoa-800">Respuesta del obrador:</strong> {review.reply}
        </p>
      )}
    </figure>
  );
}
