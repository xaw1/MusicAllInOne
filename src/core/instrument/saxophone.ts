import { PitchedInstrument } from './pitched';
import { fingeringFor } from './sax-fingerings';

export class SaxophoneInstrument extends PitchedInstrument {
  override readonly id = 'saxophone';
  override readonly label = 'Saxophone';

  /** Pressed key ids for a WRITTEN MIDI note, or null if not charted. */
  fingering(writtenMidi: number): string[] | null {
    return fingeringFor(writtenMidi);
  }
}
