"use client";

import Cockpit from "@/components/Cockpit";
import PitchOpen from "@/components/pitch/PitchOpen";
import PitchClose from "@/components/pitch/PitchClose";

/**
 * Pitch shell: open slide → FounderHUD hub → close slide.
 * Vertical snap scroll — present like a deck, demo live in the middle.
 */
export default function PitchDeck() {
  return (
    <div className="h-dvh snap-y snap-mandatory overflow-y-auto scroll-smooth">
      <section
        id="pitch-open"
        className="h-dvh shrink-0 snap-start snap-always"
      >
        <PitchOpen />
      </section>

      <section
        id="pitch-hub"
        className="h-dvh shrink-0 snap-start snap-always overflow-hidden"
      >
        <div className="h-full min-h-0">
          <Cockpit />
        </div>
      </section>

      <section
        id="pitch-close"
        className="h-dvh shrink-0 snap-start snap-always"
      >
        <PitchClose />
      </section>
    </div>
  );
}
