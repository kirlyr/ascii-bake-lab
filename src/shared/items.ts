// Teks item untuk inventory Tavern (bahasa Inggris, placeholder lore). Key = key layer di file bake.
// Tanpa stats: portfolio, bukan game sungguhan.

export const SLOTS = [
  { key: 'helmet', label: 'Head' },
  { key: 'hair', label: 'Hair' },
  { key: 'beard', label: 'Beard' },
  { key: 'shoulder', label: 'Shoulders' },
  { key: 'torso', label: 'Chest' },
  { key: 'back', label: 'Back' },
  { key: 'weapon', label: 'Weapon' },
  { key: 'legs', label: 'Legs' },
  { key: 'feet', label: 'Feet' },
] as const;

export interface ItemText {
  name: string;
  /** satu baris jenis/asal, tampil abu-abu di bawah nama. */
  kind: string;
  desc: string;
}

export const ITEMS: Record<string, ItemText> = {
  ranger_torso: { name: 'Ranger Jerkin', kind: 'chest · cloth & leather', desc: 'Moss-green wool over a stitched leather vest. Quiet in the brush, warm at the watch fire.' },
  peasant_torso: { name: 'Peasant Tunic', kind: 'chest · linen', desc: 'Plain linen, patched at both elbows. Every hero starts in one of these.' },
  cuirass_leather: { name: 'Leather Cuirass', kind: 'chest · boiled leather', desc: 'Hardened in wax and oil. Light enough to run in, stiff enough to matter.' },
  cuirass_metal: { name: 'Iron Cuirass', kind: 'chest · plate', desc: 'Plain iron plate with pauldrons riveted on. Standard issue for the town watch.' },
  cuirass_metal2: { name: 'Steel Cuirass', kind: 'chest · plate', desc: 'Polished steel, fluted at the shoulders. A knight-errant would not be ashamed.' },
  cuirass_black: { name: 'Blackguard Cuirass', kind: 'chest · plate & ruby', desc: 'Blackened plate with horned shoulders. Worn by those who want to be remembered.' },
  cuirass_golden: { name: 'Golden Cuirass', kind: 'chest · gilded plate', desc: 'Gilded plate from a royal parade. Impractical, and absolutely worth it.' },
  ranger_legs: { name: 'Ranger Trousers', kind: 'legs · cloth', desc: 'Reinforced at the knee for long days of kneeling, tracking and waiting.' },
  peasant_legs: { name: 'Woolen Breeches', kind: 'legs · wool', desc: 'Spun in the village, dyed in the river. Itchy, but they last.' },
  ranger_feet: { name: 'Ranger Boots', kind: 'feet · leather', desc: 'Soft soles, high cuffs. They have walked every road on the old map.' },
  peasant_feet: { name: 'Wrapped Shoes', kind: 'feet · wool', desc: 'Cloth wraps over thin leather. Good for fields, bad for dragons.' },
  plate_legs: { name: 'Iron Greaves', kind: 'legs · plate & cloth', desc: 'Cuisses, knee cops and greaves over ranger trousers. You hear them coming a mile off.' },
  plate_feet: { name: 'Iron Sabatons', kind: 'feet · plate', desc: 'Overlapping lames from heel to toe. Ruinous on stairs, glorious on toes.' },
  ranger_pauldron: { name: 'Ranger Pauldron', kind: 'shoulders · plate', desc: 'A single plate on the bow arm. Turns a stray arrow, not much more.' },
  knight_pads: { name: 'Knight Pauldrons', kind: 'shoulders · plate', desc: 'Twin plates from the old guard armory. Heavy, loud and very reassuring.' },
  hair_parted: { name: 'Parted Hair', kind: 'hair', desc: 'Short and parted to the side. Neat enough for a feast hall, messy enough for the road.' },
  hair_buzzed: { name: 'Buzzed Hair', kind: 'hair', desc: 'Cropped close, the way the old garrison barber liked it. Fits under any helm.' },
  hair_long: { name: 'Long Hair', kind: 'hair', desc: 'Grown out over many winters on the road. Catches the wind, and sometimes the brambles.' },
  beard: { name: 'Beard', kind: 'beard', desc: 'Full and close-trimmed. Keeps the chin warm on long night watches.' },
  cloak: { name: 'Wanderer Cloak', kind: 'back · wool', desc: 'Heavy wool, frayed at the hem. Keeps off the rain, the cold, and most questions.' },
  wings: { name: 'Fallen Wings', kind: 'back · feather', desc: 'Folded pinions of a fallen guardian, torn at the edges. They do not lift you, but every tavern goes quiet.' },
  helmet1: { name: 'Iron Helm', kind: 'head · plate', desc: 'Hammered from one sheet of iron. Dented, but never broken.' },
  helmet2: { name: 'Knight Helm', kind: 'head · plate', desc: 'Closed visor, narrow sight. The knight sees little, and fears less.' },
  helmet3: { name: 'Noble Helm', kind: 'head · plate & gold', desc: 'Gilded crest of a house nobody remembers. The gold is still real.' },
  crown: { name: 'Gold Crown', kind: 'head · gold', desc: 'Light on the head, heavy on the mind.' },
  crown2: { name: 'Ruby Crown', kind: 'head · gold & ruby', desc: 'The ruby was cut from a dragon egg. Or so the merchant swore.' },
  sword: { name: 'Longsword', kind: 'weapon · one-handed', desc: 'A balanced blade from the tavern forge. Takes any rune you feed it.' },
  shortsword: { name: 'Shortsword', kind: 'weapon · one-handed', desc: 'Quick and close. Favoured by guards who expect trouble indoors.' },
  katana: { name: 'Katana', kind: 'weapon · one-handed', desc: 'Folded steel from a land past the eastern sea. One clean edge.' },
  club: { name: 'Mace', kind: 'weapon · one-handed', desc: 'Iron flanges on an oak haft. Armour is merely a suggestion.' },
  axe: { name: 'Bearded Axe', kind: 'weapon · one-handed', desc: 'A woodcutter axe from the northern village, sharpened for worse work.' },
  spear: { name: 'Spear', kind: 'weapon · polearm', desc: 'Long reach, simple craft. The first weapon of every militia.' },
  hammer: { name: 'War Hammer', kind: 'weapon · heavy', desc: 'Two heads, no mercy. Built for breaking shields and doors.' },
  scythe: { name: 'Reaper Scythe', kind: 'weapon · heavy', desc: 'It was a farm tool once. Nobody asks what it harvests now.' },
};

/** Fallback untuk layer baru yang belum punya teks. */
export const itemText = (key: string, label: string): ItemText => ITEMS[key] ?? { name: label, kind: '', desc: '' };
