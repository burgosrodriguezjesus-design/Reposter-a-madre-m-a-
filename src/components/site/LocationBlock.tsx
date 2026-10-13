import { Clock, MapPin, Navigation, Phone } from "lucide-react";
import { WhatsAppIcon } from "@/components/icons";
import { MapEmbed } from "@/components/site/MapEmbed";
import { OpeningHours } from "@/components/site/OpeningHours";
import type { OpeningSchedule } from "@/lib/schedule";
import type { BusinessSettings } from "@/lib/settings-types";
import { fullAddress, mapsDirectionsUrl, mapsEmbedUrl } from "@/lib/structured-data";
import { telLink, whatsappLink } from "@/lib/format";

export function LocationBlock({ business: b, schedule }: { business: BusinessSettings; schedule: OpeningSchedule }) {
  return (
    <div className="grid items-start gap-8 lg:grid-cols-[1.2fr_1fr]">
      <MapEmbed src={mapsEmbedUrl(b)} title={`Mapa de ${b.name}`} />
      <div className="card p-6 sm:p-8">
        <h3 className="flex items-center gap-2 font-display text-2xl text-cocoa-900">
          <MapPin className="size-5 text-gold-600" /> {b.venue || (b.neighborhood ? `${b.neighborhood}, ${b.city}` : b.city)}
        </h3>
        <p className="mt-2 text-cocoa-700">{b.venue ? `${b.street}, ${b.postalCode} ${b.city}` : fullAddress(b)}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <a href={mapsDirectionsUrl(b)} target="_blank" rel="noopener noreferrer" className="btn-primary btn-sm">
            <Navigation className="size-4" /> Cómo llegar
          </a>
          <a href={telLink(b.phone)} className="btn-outline btn-sm">
            <Phone className="size-4" /> Llamar
          </a>
          {b.whatsapp && (
            <a href={whatsappLink(b.whatsapp)} target="_blank" rel="noopener noreferrer" className="btn-outline btn-sm">
              <WhatsAppIcon className="size-4" /> WhatsApp
            </a>
          )}
        </div>
        <h4 className="mt-7 mb-2 flex items-center gap-2 font-semibold text-cocoa-900">
          <Clock className="size-4 text-gold-600" /> Horario
        </h4>
        <OpeningHours schedule={schedule} />
      </div>
    </div>
  );
}
