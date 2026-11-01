// A colour palette per map for the blockout (floor, buildings, low cover, the ground
// around the map), loosely matching each map's setting.
import type { MapTheme } from "./shapes";

const T = (floor: string, block: string, low: string, ground: string): MapTheme => ({ floor, block, low, ground });

export const DEFAULT_THEME = T("#2b2f37", "#4a505d", "#6a7182", "#121419");

export const MAP_THEMES: Record<string, MapTheme> = {
  // Black Ops 7
  Den: T("#2f2b27", "#5b4a3b", "#7a6650", "#14110e"), // Japanese estate: dark wood
  Raid: T("#2c3029", "#4f5a49", "#6f7d63", "#0f130e"), // hillside mansion: garden greens
  Scar: T("#3a3127", "#6b563e", "#8a7152", "#17120c"), // desert town
  Colossus: T("#262d36", "#3f5068", "#5f7590", "#0b1018"), // cruise ship: navy
  Exposure: T("#353a3e", "#626c74", "#8a959e", "#15181a"), // salt flats: pale grey
  Blackheart: T("#23302f", "#3d5552", "#5d7b77", "#0b1211"), // undersea base: teal
  "Cliff Town": T("#33302b", "#5d574d", "#7e766a", "#13110f"), // stone village
  Gridlock: T("#2a2b2e", "#4b4e55", "#6b7079", "#101113"), // city traffic
  Sake: T("#33292a", "#6a4440", "#8c5f58", "#140d0d"), // brewery: red wood
  Fringe: T("#30302a", "#5a5a44", "#7b7b5c", "#12120d"), // farm
  Plaza: T("#34312f", "#625b55", "#857c74", "#141211"), // marble square
  Hacienda: T("#36302a", "#7a5a43", "#9b7a5f", "#16110c"), // terracotta villa
  // Black Ops 6
  Protocol: T("#2a3129", "#4b5d48", "#6d8266", "#0d120c"), // island base
  "Red Card": T("#283028", "#41573f", "#5e7a5a", "#0c120b"), // stadium
  Rewind: T("#2e2a35", "#544a66", "#76698c", "#110e15"), // retro mall: purple
  Skyline: T("#272c33", "#465565", "#677a8f", "#0c0f13"), // penthouse glass
  Vault: T("#332f27", "#5e5541", "#837656", "#13110c"), // bank: gold stone
  Dealership: T("#2b2b2d", "#4c4d52", "#6d6e75", "#111113"), // car lot asphalt
  // Modern Warfare III
  Invasion: T("#352f27", "#605440", "#827257", "#15120d"),
  Karachi: T("#352f28", "#62543f", "#86735a", "#15110c"),
  Skidrow: T("#312a28", "#5b4943", "#7c645c", "#130f0e"),
  "Sub Base": T("#30343a", "#566170", "#7a8696", "#121519"), // snow and steel
  Terminal: T("#2d3034", "#515863", "#747d8a", "#111316"),
  Highrise: T("#2c2f33", "#4f5660", "#717a86", "#101215"),
  Rio: T("#342c2c", "#64504a", "#8a6d64", "#140f0f"),
  "6 Star": T("#2e2c33", "#55505f", "#797286", "#111014"),
  Vista: T("#2b3029", "#4f5a49", "#727f6a", "#0f120d"),
};

export const themeFor = (map: string): MapTheme => MAP_THEMES[map] ?? DEFAULT_THEME;
