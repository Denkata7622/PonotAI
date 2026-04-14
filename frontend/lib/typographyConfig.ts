export const BODY_FONT_OPTIONS = ["inter", "system", "poppins", "nunito", "ibm-plex-sans", "manrope", "dm-sans", "plus-jakarta-sans", "outfit", "sora"] as const;
export const DISPLAY_FONT_OPTIONS = ["manrope", "outfit", "sora", "space-grotesk", "orbitron", "audiowide", "rajdhani", "exo-2", "oxanium", "chakra-petch", "russo-one", "michroma", "pirata-one", "unifraktur-cook", "yatra-one", "kalam", "marck-script", "bungee", "bungee-shade", "monoton", "black-ops-one", "archivo-black"] as const;
export const DISPLAY_TEXT_STYLE_OPTIONS = ["static", "soft-gradient", "subtle-glow", "slight-depth", "cyber-pulse", "shadowed-poster"] as const;
export const TEXT_SCALE_OPTIONS = ["sm", "md", "lg"] as const;

export type BodyFontOption = (typeof BODY_FONT_OPTIONS)[number];
export type DisplayFontOption = (typeof DISPLAY_FONT_OPTIONS)[number];
export type DisplayTextStyleOption = (typeof DISPLAY_TEXT_STYLE_OPTIONS)[number];
