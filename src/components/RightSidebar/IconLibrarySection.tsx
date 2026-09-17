import { Plus, Sparkles } from "lucide-react";
import { useState } from "react";
import { SidebarSection } from "./SidebarSection";

export type IconPreset = {
  name: string;
  src: string;
  tileClassName: string;
};

export const iconPresets: IconPreset[] = [
  {
    name: "Sparkle",
    src: "/icons/sparkle.png",
    tileClassName: "bg-[#332946] hover:bg-[#3d3154]",
  },
  {
    name: "Camera",
    src: "/icons/camera.png",
    tileClassName: "bg-[#1f3438] hover:bg-[#274247]",
  },
  {
    name: "Rocket",
    src: "/icons/rocket.png",
    tileClassName: "bg-[#3b292f] hover:bg-[#493238]",
  },
  {
    name: "Heart",
    src: "/icons/heart.png",
    tileClassName: "bg-[#3c2735] hover:bg-[#4b2d41]",
  },
  {
    name: "App window",
    src: "/icons/app-window.png",
    tileClassName: "bg-[#282c4c] hover:bg-[#30365c]",
  },
  {
    name: "Lightning",
    src: "/icons/lightning.png",
    tileClassName: "bg-[#3c3521] hover:bg-[#4a4126]",
  },
];

const glassIconPresets: IconPreset[] = [
  {
    name: "Palette",
    src: "/icons/glass-palette.png",
    tileClassName: "bg-[#203b4d] hover:bg-[#284b61]",
  },
  {
    name: "Analytics",
    src: "/icons/glass-chart.png",
    tileClassName: "bg-[#283653] hover:bg-[#314268]",
  },
  {
    name: "Chat bubbles",
    src: "/icons/glass-chat.png",
    tileClassName: "bg-[#293d50] hover:bg-[#34516a]",
  },
  {
    name: "Lock",
    src: "/icons/glass-lock.png",
    tileClassName: "bg-[#342f51] hover:bg-[#403a65]",
  },
  {
    name: "Globe",
    src: "/icons/glass-globe.png",
    tileClassName: "bg-[#1f4353] hover:bg-[#28566a]",
  },
  {
    name: "Bell",
    src: "/icons/glass-bell.png",
    tileClassName: "bg-[#4a3543] hover:bg-[#5c4052]",
  },
];

const iconPacks = {
  emoji: {
    label: "Emoji",
    title: "Emoji-inspired",
    subtitle: "Original stickers, ready to use",
    presets: iconPresets,
  },
  glass: {
    label: "Liquid glass",
    title: "Liquid glass",
    subtitle: "Glossy color, ready to use",
    presets: glassIconPresets,
  },
} as const;

type IconPackId = keyof typeof iconPacks;

interface IconLibrarySectionProps {
  onAddIcon: (src: string, name: string) => void;
}

export const IconLibrarySection = ({
  onAddIcon,
}: IconLibrarySectionProps) => {
  const [activePackId, setActivePackId] = useState<IconPackId>("emoji");
  const activePack = iconPacks[activePackId];

  return (
    <SidebarSection title="Free stickers">
      <div className="overflow-hidden rounded-xl border border-white/10 bg-[#18171b]">
        <div className="relative overflow-hidden border-b border-white/10 bg-[radial-gradient(circle_at_top_right,_rgba(167,139,250,0.26),_transparent_58%),linear-gradient(135deg,_#282033,_#17171c)] p-3">
          <div className="relative flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/10 text-violet-200 ring-1 ring-white/10">
                <Sparkles size={16} fill="currentColor" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-white">
                  {activePack.title}
                </p>
                <p className="truncate text-[10px] text-violet-200/70">
                  {activePack.subtitle}
                </p>
              </div>
            </div>
            <span className="shrink-0 rounded-full bg-white/10 px-2 py-1 text-[10px] font-medium text-violet-100">
              {activePack.presets.length} free
            </span>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-1 rounded-lg bg-black/20 p-1">
            {(Object.keys(iconPacks) as IconPackId[]).map((packId) => (
              <button
                key={packId}
                type="button"
                onClick={() => setActivePackId(packId)}
                aria-pressed={activePackId === packId}
                className={`rounded-md px-2 py-1.5 text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 ${
                  activePackId === packId
                    ? "bg-white text-[#201a2c] shadow-sm"
                    : "text-violet-100/60 hover:bg-white/10 hover:text-violet-100"
                }`}
              >
                {iconPacks[packId].label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 p-2.5">
          {activePack.presets.map((icon) => (
            <button
              key={icon.name}
              type="button"
              onClick={() => onAddIcon(icon.src, icon.name)}
              className={`group relative aspect-square overflow-hidden rounded-lg border border-white/5 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 ${icon.tileClassName}`}
              aria-label={`Add ${icon.name} sticker`}
              title={`Add ${icon.name}`}
            >
              <img
                src={icon.src}
                alt=""
                className="h-full w-full object-contain p-2 transition-transform duration-200 group-hover:scale-110"
              />
              <span className="absolute inset-x-1 bottom-1 truncate rounded bg-black/35 px-1 py-0.5 text-[9px] font-medium text-white/80 backdrop-blur-sm">
                {icon.name}
              </span>
              <span className="absolute right-1 top-1 flex h-5 w-5 translate-y-1 items-center justify-center rounded-full bg-white text-black opacity-0 shadow-lg transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100">
                <Plus size={12} strokeWidth={2.5} />
              </span>
            </button>
          ))}
        </div>

        <p className="border-t border-white/10 px-3 py-2 text-[10px] leading-relaxed text-gray-500">
          Click a sticker to place it on the canvas. Drag, resize, or rotate it
          from the overlay controls below.
        </p>
      </div>
    </SidebarSection>
  );
};
