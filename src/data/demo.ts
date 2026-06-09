/* ----------------------------------------------------------------------------
   Bundled first-run demo, written in alphaTex (alphaTab's text notation).

   It deliberately has TWO tracks — a simple keys/comp part and a drum groove —
   so on first launch you immediately see multi-track notation stacked together
   AND hear the backing part underneath the drums (the core "play-along" idea).

   Replace it any time by importing a Guitar Pro / MusicXML file.
---------------------------------------------------------------------------- */

export const DEMO_TEX = `
\\title "Demo groove"
\\subtitle "Import a Guitar Pro or MusicXML file, then focus any track in the Practice panel"
\\tempo 100

\\track "Keys"
\\instrument piano
:4 (E2 E3) (E2 E3) (G2 G3) (A2 A3) |
(E2 E3) (E2 E3) (D2 D3) (A2 A3) |
(E2 E3) (E2 E3) (G2 G3) (A2 A3) |
(C2 C3) (D2 D3) (E2 E3) r |

\\track "Drums"
\\instrument percussion
\\clef neutral
\\articulation defaults
:8 (KickHit RideBell) RideBell (SnareHit RideBell) RideBell (KickHit RideBell) RideBell (SnareHit RideBell) RideBell |
:8 (KickHit RideBell) RideBell (SnareHit RideBell) RideBell (KickHit RideBell) KickHit (SnareHit RideBell) RideBell |
:8 (KickHit RideBell) RideBell (SnareHit RideBell) RideBell (KickHit RideBell) RideBell (SnareHit RideBell) RideBell |
:8 (KickHit RideBell) RideBell (SnareHit RideBell) RideBell (KickHit SnareHit) KickHit SnareHit SnareHit |
`.trim();
