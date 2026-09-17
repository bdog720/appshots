# Breezel

Breezel is a free, open-source editor for App Store and Google Play screenshots. Drop your app's screens into realistic device frames, add headlines and backgrounds, and export every size the stores ask for. Run it in Docker and your projects are saved on your own server.

Breezel started as a fork of [AppShots](https://github.com/oyeolamilekan/appshots) by Oye Olalekan Johnson. See [Credits](#credits).

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-4.0-38B2AC?logo=tailwindcss)

## ✨ Features

### 📱 Device Frames

- **6 realistic device mockups** — iPhone 15 Pro Max, iPhone 15 Pro, iPhone 14, iPad Pro 12.9", Samsung Galaxy S24 Ultra, Samsung Galaxy Tab S9
- **Multiple color options per device** — Black Titanium, Natural, Blue, White, and more
- **Multi-device compositions** — add, select, reorder, and style multiple independent devices inside a single screenshot
- **Independent device instances** — each device keeps its own screen image, model, color, transform, 3D angles, and shadow
- **Cross-screen device overflow** — drag devices past the left or right edge to continue them into adjacent screenshots
- **Flat & 3D rendering modes** — toggle between a classic 2D frame and a perspective 3D view with visible device edges
- **3D rotation controls** — adjust Rotate Y and Rotate X angles for the perfect perspective
- **Accurate camera elements** — Dynamic Island, notch, and punch-hole camera matching each device

### 🎨 Backgrounds & Appearance

- **Solid color backgrounds** with a full color picker
- **Gradient presets** — Sunset, Ocean, Mint, Berry, Royal, Rose
- **Global text color picker**

### 📝 Rich Text & Fonts

- **Rich text editor** for headlines and subheadlines — bold, italic, underline, text color, alignment (left/center/right), and text background highlights
- **Rounded highlight styling** — highlighted text uses padded, rounded backgrounds that match in the editor, preview, and export
- **Google Fonts integration** — search and preview hundreds of fonts
- **Independent sizing** — separate font size sliders for headline and subheadline
- **Width control** — set how wide each text block spans
- **Drag-to-reposition** — click and drag headlines or subheadlines anywhere on the canvas

### 🖼️ Overlay Images

- **Unlimited overlay images** — upload badges, logos, arrows, or decorations
- **Drag-to-reposition** and **resize** with width percentage control
- **Rotation control** per image
- **Layer management** — place behind or in front of the device, reorder with bring forward/backward/to-front/to-back
- **Per-image shadow** — enable/disable with color, blur, and offset controls

### 📸 Screenshot Image

- **Upload your app screenshots** — each device frame can display its own screen image

### 📐 Layout & Positioning

- **8 position presets** — Centered, Bleed Bottom, Bleed Top, Float Center, Float Bottom, Tilt Left, Tilt Right, Perspective
- **Device size** slider (scale %)
- **Device vertical position** slider (offset %)
- **Device rotation** (flat mode) or **3D rotation** (3D mode)
- **Device shadow** — toggle on/off with color, blur, and vertical offset controls

### 📋 Project Management

- **Multiple projects** — create, rename, switch between, and delete projects
- **Auto-save** — all projects and settings persist to localStorage across sessions
- **Reset to defaults** — clear everything and start fresh

### 📦 Export

- **Batch export** — export all screenshots at once (ZIP for multiple, PNG for single)
- **App Store & Play Store export presets** — Apple: 6.7"/6.5"/5.5" iPhone, 12.9" iPad Pro; Google Play: 9:16 & 20:9 phone, 7" & 10" tablet, and the 1024×500 feature graphic
- **Full 3D support** — 3D perspective, edges, and shadows are preserved in exports
- **Cross-screen layouts preserved** — multi-device overflow compositions export exactly like the on-canvas preview
- **Pixel-perfect** — exported images match the on-screen preview
- **Post-export GitHub prompt** — after export, show a quick modal with a direct link to star the project on GitHub

### 🖥️ Editor Experience

- **Multi-screenshot gallery** — add, remove, and navigate screenshots in a horizontal carousel
- **Real-time preview** — all changes update instantly on the canvas
- **Drag-and-drop** — reposition any element by dragging directly on the canvas
- **Device manager** — add, select, remove, and reorder devices from the right sidebar
- **Element selection** — click to select text, devices, or overlay images with visual feedback
- **Helpful rich-text tooltips** — formatting controls include hover/focus tooltips
- **Dark mode UI** — sleek dark interface that's easy on the eyes

## 🚀 Quick Start

### Prerequisites

- [Bun](https://bun.sh/) (recommended) or Node.js 18+

### Installation

```bash
# Clone the repository
git clone https://github.com/bdog720/breezel.git
cd breezel

# Install dependencies
bun install

# Start the development server
bun run dev
```

The app will be available at `http://localhost:5173`

### Building for Production

```bash
bun run build
```

The built files will be in the `dist/` directory.

## 🐳 Run with Docker

No Bun or Node install required — just Docker.

### Docker Compose (recommended)

```bash
docker compose up -d --build
```

Then open **http://localhost:8080**. To use a different port:

```bash
BREEZEL_PORT=3000 docker compose up -d --build
```

Stop it with `docker compose down`.

### Plain Docker

```bash
docker build -t breezel .
docker run -d -p 8080:80 -v breezel-data:/data --name breezel breezel
```

The image is a multi-stage build: Bun + Vite compile the app, and a small Bun server serves it together with the storage API. Projects, images and version history are saved in `/data` — mount a volume there or they are lost when the container is recreated.

### Prebuilt image (Dockge / Portainer / self-host)

Every push to the default branch publishes a multi-arch image (amd64 + arm64) to the GitHub Container Registry via GitHub Actions. Point your compose stack at it — no local build needed:

```yaml
services:
  breezel:
    image: ghcr.io/bdog720/breezel:latest
    container_name: breezel
    restart: unless-stopped
    ports:
      - "8080:80"
    volumes:
      - breezel-data:/data
    # environment:
    #   BREEZEL_PASSWORD: change-me

volumes:
  breezel-data:
```

In **Dockge**, create a new Compose stack, paste the above, and deploy. Pull updates later with the stack's **Update** button. (If the package is private, either make it public in the repo's Packages settings or log the host in to `ghcr.io` first.)

### Storage, passwords and backups

- **Where projects live:** with the Docker image, projects, images and version history are stored in the container's `/data` volume, so they're the same from any browser that can reach it. Running `bun run dev` (or hosting the static build elsewhere) saves to the browser instead. Use `bun run dev:server` alongside `bun run dev` to try container storage locally.
- **Password:** set `BREEZEL_PASSWORD` to require a login. Without it, anyone who can reach the port can read and change projects — keep it on your LAN or behind a reverse proxy with its own auth.
- **Backups:** copy the volume (e.g. `docker run --rm -v breezel-data:/data -v "$PWD":/backup alpine tar czf /backup/breezel-data.tgz -C /data .`), or use **Export Project** for individual projects.
- **Permissions:** the server runs as the `bun` user. If you bind-mount a host folder instead of a named volume, make sure that user can write to it, or Breezel falls back to browser storage and shows a warning.
- **Upgrading:** when you first open a container that has no projects, Breezel moves the projects saved in that browser into it. The browser copy is kept as a backup.
- **Coming from AppShots:** existing installs keep working. The server still reads `APPSHOTS_PASSWORD`, `APPSHOTS_DATA_DIR` and `APPSHOTS_DIST_DIR` and logs a note asking you to rename them to `BREEZEL_*`. If your stack mounts a volume such as `appshots-data`, keep that name and your projects stay put. If you switch to this repo's `docker-compose.yml`, copy the old volume into the new one first (run `docker volume ls` to see the real names; compose adds the project folder as a prefix):

  ```bash
  docker run --rm -v appshots_appshots-data:/from -v breezel_breezel-data:/to alpine cp -a /from/. /to/
  ```

  Old `.appshots.json` backups and agent bundles with `appshots.json` still import.

## 🛠️ Tech Stack

- **Framework**: [React 19](https://react.dev/)
- **Routing**: [TanStack Router](https://tanstack.com/router)
- **Styling**: [Tailwind CSS 4](https://tailwindcss.com/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **UI Components**: [shadcn/ui](https://ui.shadcn.com/)
- **Build Tool**: [Vite 7](https://vitejs.dev/)
- **Testing**: [Vitest](https://vitest.dev/)
- **Runtime**: [Bun](https://bun.sh/)

## 📁 Project Structure

```
src/
├── components/
│   ├── CanvasPreview/       # Main canvas, screenshot cards, device container, overlays
│   ├── DeviceFrame/         # Device mockups (flat 2D & 3D with edges)
│   ├── FontPicker/          # Google Fonts search & selection
│   ├── GitHubStarModal.tsx  # Post-export GitHub star modal
│   ├── LeftSidebar/         # Device picker, color picker, export controls
│   ├── ProjectSwitcher/     # Project management UI
│   ├── RichTextEditor/      # Rich text formatting toolbar & editor
│   ├── RightSidebar/        # Layout, appearance, content, device, overlay controls
│   ├── EditorLayout.tsx     # Main editor layout shell
│   └── ui/                  # shadcn/ui components
├── context/
│   └── EditorContext.tsx     # Global editor state & actions
├── lib/
│   ├── device-instances.ts  # Device instance helpers and legacy normalization
│   ├── device-overflow.ts   # Cross-screen device overflow calculations
│   ├── export-utils.ts      # Canvas-based screenshot export (flat & 3D)
│   ├── google-fonts.ts      # Google Fonts API loader
│   ├── rich-text-canvas.ts  # Rich text rendering for canvas export
│   └── useLocalStorage.ts   # Persistence hooks
├── routes/
│   ├── __root.tsx           # Root layout
│   └── index.tsx            # Home page
├── types/                   # TypeScript type definitions
├── constants.ts             # Device specs, gradients, export sizes
├── main.tsx                 # Application entry point
└── styles.css               # Global styles
```

## 🎯 Usage

1. **Select a device** — pick from iPhones, iPads, or Samsung devices in the left sidebar
2. **Choose a color** — select a device frame color
3. **Upload a screenshot** — add your app's screenshot to the device screen
4. **Add more devices** — build multi-device layouts and customize each frame independently
5. **Edit text** — click headlines/subheadlines to type, use the rich text toolbar to format and highlight text
6. **Pick a font** — browse Google Fonts to find the perfect typeface
7. **Set a background** — choose a solid color or gradient preset
8. **Position the device** — use presets or manually adjust size, position, rotation, and shadow
9. **Switch to 3D** — toggle to 3D mode and adjust perspective angles
10. **Span screenshots** — drag devices past the left or right edge to continue them into adjacent screenshots
11. **Add overlays** — upload badges, logos, or decorations and layer them around the device
12. **Manage screenshots** — add more screenshots to create a complete set
13. **Export** — download all screenshots at App Store resolution, then optionally star the project from the post-export modal

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow the existing code style
- Write tests for new features
- Update documentation as needed
- Keep commits atomic and well-described

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Credits

Breezel is built on [AppShots](https://github.com/oyeolamilekan/appshots), created by Oye Olalekan Johnson and released under the MIT License. The editor, device frames and export pipeline started there.

## 🙏 Acknowledgments

- [TanStack](https://tanstack.com/) for the amazing router and devtools
- [Tailwind CSS](https://tailwindcss.com/) for the utility-first CSS framework
- [Lucide](https://lucide.dev/) for beautiful icons
- [Google Fonts](https://fonts.google.com/) for the font library

## 📬 Contact

- Create an [issue](https://github.com/bdog720/breezel/issues) for bug reports or feature requests
- Star ⭐ this repo if you find it useful!

---

Made with ❤️ for iOS and Android developers
