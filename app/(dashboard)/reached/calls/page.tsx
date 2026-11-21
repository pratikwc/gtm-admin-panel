import { PhoneCall } from 'lucide-react';

export default function OutboundCallsPage() {
  return (
    <section className="rounded-2xl border border-dashed bg-card px-6 py-14 text-center">
      <div className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-accent text-primary">
        <PhoneCall className="h-5 w-5" />
      </div>
      <h2 className="mt-4 text-lg font-semibold">Outbound calls are coming soon</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
        Once calling starts, this tab will show calls made, connect rate, conversations and meetings booked, split by market,
        industry and caller, next to the email results so both channels read the same way.
      </p>
    </section>
  );
}
