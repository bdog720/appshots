import React, {
  createContext,
  useContext,
  useState,
  useRef,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import type {
  DeviceSpec,
  DeviceColor,
  DeviceInstance,
  ExportSize,
  Screenshot,
  ImageOverlay,
  ShadowConfig,
  Project,
  SelectedElement,
} from "../types";
import { devices, exportSizes, gradientPresets } from "../constants";
import { exportScreenshots } from "../lib/export-utils";
import {
  cloneDeviceInstance,
  createDeviceInstance,
  ensureDeviceInstances,
  getDeviceColorById,
  getDeviceSpecById,
} from "../lib/device-instances";
import {
  loadPersistedState,
  useEditorPersistence,
  clearPersistedState,
} from "../lib/useLocalStorage";
import type { TextSettings, TextSettingKey } from "../lib/text-settings";
import {
  DEFAULT_TEXT_SETTINGS,
  overrideScreenshotText,
  resetScreenshotText,
  applyTextDefaultToScreenshots,
  deriveTextOverrides,
} from "../lib/text-settings";
import { addColorToPalette, removeColorFromPalette } from "../lib/saved-colors";
import { useSnapshotHistory } from "../lib/useSnapshotHistory";
import { buildImportedScreenshots } from "../lib/bulk-import";
import {
  serializeProject,
  parseProjectFile,
  suggestProjectFilename,
} from "../lib/project-io";

function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

/** Read a File as a data URL, resolving to null if it can't be read. */
function readFileAsDataURL(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

interface EditorContextType {
  // Project state
  projects: Project[];
  activeProjectId: string;
  activeProject: Project;
  createProject: (name: string) => void;
  renameProject: (id: string, name: string) => void;
  deleteProject: (id: string) => void;
  switchProject: (id: string) => void;
  /** Download a project as a JSON backup file */
  exportProject: (id: string) => void;
  /** Import a project from a JSON backup file (throws on invalid input) */
  importProject: (file: File) => Promise<void>;

  // State
  isFontPickerOpen: boolean;
  setIsFontPickerOpen: (open: boolean) => void;
  /** Whether the font picker edits the global default or the active screenshot */
  fontPickerScope: "global" | "screenshot";
  setFontPickerScope: (scope: "global" | "screenshot") => void;
  isStarModalOpen: boolean;
  setIsStarModalOpen: (open: boolean) => void;
  isShortcutsOpen: boolean;
  setIsShortcutsOpen: (open: boolean) => void;
  selectedDeviceId: string;
  setSelectedDeviceId: (id: string) => void;
  selectedColorId: string;
  setSelectedColorId: (id: string) => void;
  exportSizeId: string;
  setExportSizeId: (id: string) => void;
  screenshots: Screenshot[];
  setScreenshots: (screenshots: Screenshot[]) => void;
  activeScreenshotId: string;
  setActiveScreenshotId: (id: string) => void;
  selectedElement: SelectedElement | null;
  setSelectedElement: (element: SelectedElement | null) => void;
  isDragging: boolean;
  /** Project-level global text defaults */
  textDefaults: TextSettings;
  /** Update a global text default and propagate to non-overriding screenshots */
  setTextDefault: <K extends TextSettingKey>(
    key: K,
    value: TextSettings[K],
  ) => void;
  /** Override a text setting on the active screenshot */
  setActiveScreenshotText: <K extends TextSettingKey>(
    key: K,
    value: TextSettings[K],
  ) => void;
  /** Clear an override on the active screenshot, reverting to the global default */
  resetActiveScreenshotText: (key: TextSettingKey) => void;
  /** Project-level saved color swatches */
  savedColors: string[];
  addSavedColor: (color: string) => void;
  removeSavedColor: (color: string) => void;
  previewDimensions: { width: number; height: number };
  setPreviewDimensions: (dim: { width: number; height: number }) => void;

  // Refs
  previewRef: React.RefObject<HTMLDivElement | null>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  canvasContainerRef: React.RefObject<HTMLDivElement | null>;
  overlayImageInputRef: React.RefObject<HTMLInputElement | null>;

  // Derived
  selectedDevice: DeviceSpec;
  selectedColor: DeviceColor;
  activeScreenshot: Screenshot;
  activeDevice: DeviceInstance;
  exportSize: ExportSize;

  // Actions
  updateActiveScreenshot: (updates: Partial<Screenshot>) => void;
  addScreenshot: () => void;
  /** Create one new screenshot tile per selected image file (appended). */
  addScreenshotsFromImages: (files: FileList | File[]) => void;
  removeScreenshot: (id: string) => void;
  handleElementMouseDown: (
    e: React.MouseEvent,
    type: "headline" | "subheadline" | "image" | "device",
    screenshotId: string,
    id?: string,
  ) => void;
  handleElementMouseMove: (e: MouseEvent) => void;
  handleElementMouseUp: () => void;
  addOverlayImage: (file: File) => void;
  removeOverlayImage: (imageId: string) => void;
  updateOverlayImageSize: (imageId: string, widthPercent: number) => void;
  updateOverlayImageLayer: (imageId: string, layer: "behind" | "front") => void;
  updateOverlayImageRotation: (imageId: string, rotation: number) => void;
  updateOverlayImageShadow: (
    imageId: string,
    shadow: Partial<ShadowConfig>,
  ) => void;
  addDevice: () => void;
  selectDevice: (deviceId: string) => void;
  removeDevice: (deviceId: string) => void;
  bringDeviceForward: (deviceId: string) => void;
  sendDeviceBackward: (deviceId: string) => void;
  bringImageForward: (imageId: string) => void;
  sendImageBackward: (imageId: string) => void;
  bringImageToFront: (imageId: string) => void;
  sendImageToBack: (imageId: string) => void;
  handleFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handleExport: () => void;
  /** Non-null while an export is running: how many screenshots are done / total. */
  exportProgress: { rendered: number; total: number } | null;
  getBackgroundStyle: (screenshot: Screenshot) => string;
  resetEditor: () => void;

  // Undo / redo over editor content
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const EditorContext = createContext<EditorContextType | undefined>(undefined);

type LegacyScreenshotFields = {
  screenshotSrc?: string | null;
  deviceScale?: number;
  deviceOffsetY?: number;
  deviceRotation?: number;
  deviceShadow?: ShadowConfig;
  deviceStyle?: "flat" | "3d";
  device3dRotateY?: number;
  device3dRotateX?: number;
};

// Fields present on older persisted projects, before global text defaults.
type LegacyProjectFields = {
  headlineFontSize?: number;
  subheadlineFontSize?: number;
  textDefaults?: TextSettings;
  savedColors?: string[];
};

/** The undoable slice of editor state (the active project's content). */
interface EditorSnapshot {
  screenshots: Screenshot[];
  textDefaults: TextSettings;
  savedColors: string[];
}

// Default screenshot for new editors
const createDefaultScreenshot = (
  defaultDeviceId: string = devices[0].id,
  defaultColorId: string = devices[0].colors[0].id,
): Screenshot => {
  const defaultDevice = createDeviceInstance({
    deviceId: defaultDeviceId,
    colorId: defaultColorId,
  });

  return {
    id: generateId(),
    headline: "Showcase Your App",
    subheadline:
      "Create stunning App Store screenshots in minutes. Customizable templates, devices, and backgrounds.",
    backgroundColor: "#8b5cf6",
    backgroundMode: "solid",
    gradientPresetId: null,
    textColor: "#ffffff",
    headlineX: 50,
    headlineY: 10,
    headlineWidth: 80,
    subheadlineX: 50,
    subheadlineY: 18,
    subheadlineWidth: DEFAULT_TEXT_SETTINGS.subheadlineWidth,
    fontFamily: DEFAULT_TEXT_SETTINGS.fontFamily,
    headlineFontSize: DEFAULT_TEXT_SETTINGS.headlineFontSize,
    subheadlineFontSize: DEFAULT_TEXT_SETTINGS.subheadlineFontSize,
    textOverrides: [],
    overlayImages: [],
    devices: [defaultDevice],
    activeDeviceId: defaultDevice.id,
  };
};

const normalizeScreenshot = (
  screenshot: Partial<Screenshot> & LegacyScreenshotFields,
  fallbackDeviceId: string,
  fallbackColorId: string,
  textDefaults: TextSettings,
): Screenshot => {
  const {
    screenshotSrc: _legacyScreenshotSrc,
    deviceScale: _legacyDeviceScale,
    deviceOffsetY: _legacyDeviceOffsetY,
    deviceRotation: _legacyDeviceRotation,
    deviceShadow: _legacyDeviceShadow,
    deviceStyle: _legacyDeviceStyle,
    device3dRotateY: _legacyDevice3dRotateY,
    device3dRotateX: _legacyDevice3dRotateX,
    ...rest
  } = screenshot;
  const baseScreenshot = createDefaultScreenshot(fallbackDeviceId, fallbackColorId);
  const { devices: deviceInstances, activeDeviceId } = ensureDeviceInstances(
    screenshot,
    fallbackDeviceId,
    fallbackColorId,
  );

  // Resolve text values: keep any explicit per-screenshot value, otherwise fall
  // back to the (migrated) global default. Font sizes are new per-screenshot
  // fields, so legacy screenshots inherit them from the project default.
  const merged = { ...baseScreenshot, ...rest };
  const resolvedText: TextSettings = {
    headlineFontSize: screenshot.headlineFontSize ?? textDefaults.headlineFontSize,
    subheadlineFontSize:
      screenshot.subheadlineFontSize ?? textDefaults.subheadlineFontSize,
    fontFamily: merged.fontFamily,
    textColor: merged.textColor,
    headlineWidth: merged.headlineWidth,
    subheadlineWidth: merged.subheadlineWidth,
  };

  return {
    ...merged,
    ...resolvedText,
    overlayImages: screenshot.overlayImages ?? [],
    devices: deviceInstances,
    activeDeviceId,
    // Preserve an existing override list; otherwise derive it by comparing the
    // resolved values against the defaults so current appearance is preserved.
    textOverrides:
      screenshot.textOverrides ?? deriveTextOverrides(resolvedText, textDefaults),
  };
};

const normalizeProject = (project: Project & LegacyProjectFields): Project => {
  const fallbackDeviceId = project.selectedDeviceId ?? devices[0].id;
  const fallbackColorId =
    project.selectedColorId ?? getDeviceSpecById(fallbackDeviceId).colors[0].id;

  // Derive global text defaults. Already-migrated projects carry `textDefaults`;
  // older ones had project-level font sizes and per-screenshot family/color/width
  // — seed the defaults from those (using the first screenshot for the rest) so
  // existing screenshots keep their current appearance via derived overrides.
  const firstScreenshot = project.screenshots[0] as
    | (Partial<Screenshot> & LegacyScreenshotFields)
    | undefined;
  const textDefaults: TextSettings = project.textDefaults ?? {
    headlineFontSize:
      project.headlineFontSize ?? DEFAULT_TEXT_SETTINGS.headlineFontSize,
    subheadlineFontSize:
      project.subheadlineFontSize ?? DEFAULT_TEXT_SETTINGS.subheadlineFontSize,
    fontFamily: firstScreenshot?.fontFamily ?? DEFAULT_TEXT_SETTINGS.fontFamily,
    textColor: firstScreenshot?.textColor ?? DEFAULT_TEXT_SETTINGS.textColor,
    headlineWidth:
      firstScreenshot?.headlineWidth ?? DEFAULT_TEXT_SETTINGS.headlineWidth,
    subheadlineWidth:
      firstScreenshot?.subheadlineWidth ?? DEFAULT_TEXT_SETTINGS.subheadlineWidth,
  };

  const normalizedScreenshots = project.screenshots.map((screenshot) =>
    normalizeScreenshot(
      screenshot,
      fallbackDeviceId,
      fallbackColorId,
      textDefaults,
    ),
  );

  const {
    headlineFontSize: _legacyHeadlineFontSize,
    subheadlineFontSize: _legacySubheadlineFontSize,
    ...rest
  } = project;

  return {
    ...rest,
    selectedDeviceId: fallbackDeviceId,
    selectedColorId: fallbackColorId,
    textDefaults,
    savedColors: project.savedColors ?? [],
    screenshots: normalizedScreenshots,
    activeScreenshotId:
      normalizedScreenshots.find((s) => s.id === project.activeScreenshotId)?.id ??
      normalizedScreenshots[0].id,
  };
};

// Create a default project
const createDefaultProject = (name: string = "My Project"): Project => {
  const defaultDeviceId = devices[0].id;
  const defaultColorId = devices[0].colors[0].id;
  const defaultScreenshot = createDefaultScreenshot(defaultDeviceId, defaultColorId);
  return {
    id: generateId(),
    name,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    screenshots: [defaultScreenshot],
    selectedDeviceId: defaultDeviceId,
    selectedColorId: defaultColorId,
    exportSizeId: exportSizes[0].id,
    activeScreenshotId: defaultScreenshot.id,
    textDefaults: { ...DEFAULT_TEXT_SETTINGS },
    savedColors: [],
  };
};

// Load persisted state once on module load
const persistedState = loadPersistedState();

// Initialize projects from persisted state or create default
const getInitialProjects = (): Project[] => {
  if (persistedState?.projects && persistedState.projects.length > 0) {
    return persistedState.projects.map(normalizeProject);
  }
  return [createDefaultProject()];
};

const getInitialActiveProjectId = (projects: Project[]): string => {
  if (persistedState?.activeProjectId) {
    // Verify the project exists
    const exists = projects.some((p) => p.id === persistedState.activeProjectId);
    if (exists) return persistedState.activeProjectId;
  }
  return projects[0]?.id || generateId();
};

export const EditorProvider = ({ children }: { children: ReactNode }) => {
  // Project state
  const [projects, setProjects] = useState<Project[]>(getInitialProjects);
  const [activeProjectId, setActiveProjectId] = useState(() =>
    getInitialActiveProjectId(projects),
  );

  // Get active project
  const activeProject =
    projects.find((p) => p.id === activeProjectId) || projects[0];

  // Initialize state from persisted values or defaults
  const [isFontPickerOpen, setIsFontPickerOpen] = useState(false);
  const [fontPickerScope, setFontPickerScope] = useState<
    "global" | "screenshot"
  >("screenshot");
  const [isStarModalOpen, setIsStarModalOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [selectedDeviceId, setSelectedDeviceIdState] = useState(
    activeProject.selectedDeviceId,
  );
  const [selectedColorId, setSelectedColorIdState] = useState(
    activeProject.selectedColorId,
  );
  const [exportSizeId, setExportSizeIdState] = useState(
    activeProject.exportSizeId,
  );
  const [screenshots, setScreenshotsState] = useState<Screenshot[]>(
    activeProject.screenshots,
  );
  const [activeScreenshotId, setActiveScreenshotIdState] = useState(
    activeProject.activeScreenshotId,
  );
  const [textDefaults, setTextDefaultsState] = useState<TextSettings>(
    activeProject.textDefaults,
  );
  const [savedColors, setSavedColorsState] = useState<string[]>(
    activeProject.savedColors,
  );

  const [selectedElement, setSelectedElement] = useState<SelectedElement | null>(
    null,
  );

  const [isDragging, setIsDragging] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const dragStartElementPos = useRef({ x: 0, y: 0 });
  const dragContainerSize = useRef({ width: 0, height: 0 });
  const rafId = useRef<number | null>(null);
  const pendingUpdate = useRef<{ x: number; y: number } | null>(null);

  const overlayImageInputRef = useRef<HTMLInputElement>(null);

  const [previewDimensions, setPreviewDimensions] = useState({
    width: 0,
    height: 0,
  });

  const [exportProgress, setExportProgress] = useState<{
    rendered: number;
    total: number;
  } | null>(null);

  const previewRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  // Sync project state when local state changes
  const updateProjectState = useCallback(() => {
    setProjects((prev) =>
      prev.map((p) =>
        p.id === activeProjectId
          ? {
              ...p,
              screenshots,
              selectedDeviceId,
              selectedColorId,
              exportSizeId,
              activeScreenshotId,
              textDefaults,
              savedColors,
              updatedAt: Date.now(),
            }
          : p,
      ),
    );
  }, [
    activeProjectId,
    screenshots,
    selectedDeviceId,
    selectedColorId,
    exportSizeId,
    activeScreenshotId,
    textDefaults,
    savedColors,
  ]);

  // Update project whenever state changes
  useEffect(() => {
    updateProjectState();
  }, [updateProjectState]);

  // Auto-save projects to localStorage
  useEditorPersistence({
    projects,
    activeProjectId,
  });

  // Undo / redo over the active project's content. Rapid edits (drags, slider
  // sweeps, typing bursts) coalesce into a single step via debounced recording.
  const applyHistorySnapshot = useCallback((snapshot: EditorSnapshot) => {
    setScreenshotsState(snapshot.screenshots);
    setTextDefaultsState(snapshot.textDefaults);
    setSavedColorsState(snapshot.savedColors);
    setSelectedElement(null);
  }, []);

  const {
    undo,
    redo,
    reset: resetHistory,
    canUndo,
    canRedo,
  } = useSnapshotHistory<EditorSnapshot>({
    value: { screenshots, textDefaults, savedColors },
    deps: [screenshots, textDefaults, savedColors],
    apply: applyHistorySnapshot,
  });

  // Wrapper functions that update both local state and project
  const setSelectedDeviceId = (id: string) => {
    setSelectedDeviceIdState(id);
    const nextColorId = getDeviceColorById(id, selectedColorId).id;
    setSelectedColorIdState(nextColorId);
    setScreenshotsState((prev) =>
      prev.map((screenshot) =>
        screenshot.id === activeScreenshotId
          ? {
              ...screenshot,
              devices: screenshot.devices.map((device) =>
                device.id === screenshot.activeDeviceId
                  ? { ...device, deviceId: id, colorId: nextColorId }
                  : device,
              ),
            }
          : screenshot,
      ),
    );
  };
  const setSelectedColorId = (id: string) => {
    setSelectedColorIdState(id);
    setScreenshotsState((prev) =>
      prev.map((screenshot) =>
        screenshot.id === activeScreenshotId
          ? {
              ...screenshot,
              devices: screenshot.devices.map((device) =>
                device.id === screenshot.activeDeviceId
                  ? { ...device, colorId: id }
                  : device,
              ),
            }
          : screenshot,
      ),
    );
  };
  const setExportSizeId = (id: string) => {
    setExportSizeIdState(id);
  };
  const setScreenshots = (newScreenshots: Screenshot[]) => {
    setScreenshotsState(newScreenshots);
  };
  const setActiveScreenshotId = (id: string) => {
    setActiveScreenshotIdState(id);
  };

  // Update a global default and push it into every screenshot that inherits it.
  const setTextDefault = <K extends TextSettingKey>(
    key: K,
    value: TextSettings[K],
  ) => {
    setTextDefaultsState((prev) => ({ ...prev, [key]: value }));
    setScreenshotsState((prev) =>
      applyTextDefaultToScreenshots(prev, key, value),
    );
  };

  // Override a text setting on the active screenshot only.
  const setActiveScreenshotText = <K extends TextSettingKey>(
    key: K,
    value: TextSettings[K],
  ) => {
    setScreenshotsState((prev) =>
      prev.map((s) =>
        s.id === activeScreenshotId ? overrideScreenshotText(s, key, value) : s,
      ),
    );
  };

  // Clear an override on the active screenshot, reverting to the global default.
  const resetActiveScreenshotText = (key: TextSettingKey) => {
    setScreenshotsState((prev) =>
      prev.map((s) =>
        s.id === activeScreenshotId
          ? resetScreenshotText(s, key, textDefaults)
          : s,
      ),
    );
  };

  const addSavedColor = (color: string) => {
    setSavedColorsState((prev) => addColorToPalette(prev, color));
  };

  const removeSavedColor = (color: string) => {
    setSavedColorsState((prev) => removeColorFromPalette(prev, color));
  };

  // Project management functions
  const createProject = (name: string) => {
    const newProject = createDefaultProject(name);
    setProjects((prev) => [...prev, newProject]);
    switchProject(newProject.id);
  };

  const renameProject = (id: string, name: string) => {
    setProjects((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, name, updatedAt: Date.now() } : p,
      ),
    );
  };

  const deleteProject = (id: string) => {
    // Don't delete the last project
    if (projects.length <= 1) return;

    setProjects((prev) => prev.filter((p) => p.id !== id));

    // If deleting active project, switch to another
    if (id === activeProjectId) {
      const remaining = projects.filter((p) => p.id !== id);
      if (remaining.length > 0) {
        switchProject(remaining[0].id);
      }
    }
  };

  const switchProject = (id: string) => {
    const project = projects.find((p) => p.id === id);
    if (!project) return;

    setActiveProjectId(id);
    setSelectedDeviceIdState(project.selectedDeviceId);
    setSelectedColorIdState(project.selectedColorId);
    setExportSizeIdState(project.exportSizeId);
    setScreenshotsState(project.screenshots);
    setActiveScreenshotIdState(project.activeScreenshotId);
    setTextDefaultsState(project.textDefaults);
    setSavedColorsState(project.savedColors);
    setSelectedElement(null);
    resetHistory({
      screenshots: project.screenshots,
      textDefaults: project.textDefaults,
      savedColors: project.savedColors,
    });
  };

  // Load a fully-formed project into the workspace as the active project.
  // Sets local state directly from the object so it doesn't depend on the
  // (async) projects state update landing first.
  const activateProject = (project: Project) => {
    setActiveProjectId(project.id);
    setSelectedDeviceIdState(project.selectedDeviceId);
    setSelectedColorIdState(project.selectedColorId);
    setExportSizeIdState(project.exportSizeId);
    setScreenshotsState(project.screenshots);
    setActiveScreenshotIdState(project.activeScreenshotId);
    setTextDefaultsState(project.textDefaults);
    setSavedColorsState(project.savedColors);
    setSelectedElement(null);
    resetHistory({
      screenshots: project.screenshots,
      textDefaults: project.textDefaults,
      savedColors: project.savedColors,
    });
  };

  const exportProject = (id: string) => {
    const project = projects.find((p) => p.id === id);
    if (!project) return;

    const blob = new Blob([serializeProject(project)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = suggestProjectFilename(project.name);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const importProject = async (file: File) => {
    const text = await file.text();
    const parsed = parseProjectFile(text); // throws on invalid input
    const normalized = normalizeProject({
      ...(parsed as Project),
      id: generateId(),
    });
    const imported: Project = {
      ...normalized,
      id: generateId(),
      name: parsed.name ? `${parsed.name} (imported)` : "Imported Project",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setProjects((prev) => [...prev, imported]);
    activateProject(imported);
  };

  const selectedDevice =
    getDeviceSpecById(selectedDeviceId);
  const selectedColor =
    getDeviceColorById(selectedDevice.id, selectedColorId);
  const activeScreenshot =
    screenshots.find((s) => s.id === activeScreenshotId) || screenshots[0];
  const activeDevice =
    activeScreenshot.devices.find(
      (device) => device.id === activeScreenshot.activeDeviceId,
    ) || activeScreenshot.devices[0];
  const exportSize =
    exportSizes.find((s) => s.id === exportSizeId) || exportSizes[0];

  const updateScreenshotById = useCallback(
    (screenshotId: string, updates: Partial<Screenshot>) => {
      setScreenshotsState((prev) =>
        prev.map((s) => (s.id === screenshotId ? { ...s, ...updates } : s)),
      );
    },
    [],
  );

  const updateActiveScreenshot = useCallback(
    (updates: Partial<Screenshot>) => {
      updateScreenshotById(activeScreenshotId, updates);
    },
    [activeScreenshotId, updateScreenshotById],
  );

  useEffect(() => {
    if (!activeDevice) return;
    if (selectedDeviceId !== activeDevice.deviceId) {
      setSelectedDeviceIdState(activeDevice.deviceId);
    }
    if (selectedColorId !== activeDevice.colorId) {
      setSelectedColorIdState(activeDevice.colorId);
    }
    if (activeScreenshot.activeDeviceId !== activeDevice.id) {
      updateActiveScreenshot({ activeDeviceId: activeDevice.id });
    }
  }, [
    activeDevice,
    activeScreenshot.activeDeviceId,
    selectedColorId,
    selectedDeviceId,
    updateActiveScreenshot,
  ]);

  const addScreenshot = () => {
    const newScreenshot: Screenshot = {
      id: generateId(),
      headline: "New Screenshot",
      subheadline: "Add your description here",
      backgroundColor: activeScreenshot.backgroundColor,
      backgroundMode: activeScreenshot.backgroundMode,
      gradientPresetId: activeScreenshot.gradientPresetId,
      // New screenshots inherit the project's global text defaults (Model A).
      textColor: textDefaults.textColor,
      headlineX: 50,
      headlineY: 10,
      headlineWidth: textDefaults.headlineWidth,
      subheadlineX: 50,
      subheadlineY: 18,
      subheadlineWidth: textDefaults.subheadlineWidth,
      fontFamily: textDefaults.fontFamily,
      headlineFontSize: textDefaults.headlineFontSize,
      subheadlineFontSize: textDefaults.subheadlineFontSize,
      textOverrides: [],
      overlayImages: [],
      devices: activeScreenshot.devices.map((device) =>
        cloneDeviceInstance(device, { id: generateId() }),
      ),
      activeDeviceId: activeScreenshot.devices[0]?.id ?? generateId(),
    };
    newScreenshot.activeDeviceId = newScreenshot.devices[0].id;
    setScreenshots([...screenshots, newScreenshot]);
    setActiveScreenshotId(newScreenshot.id);
  };

  // Create one screenshot tile per selected image, appended after the existing
  // tiles and cloned from the current tile's style. Non-image or unreadable
  // files are skipped. The whole import lands as a single history step.
  const addScreenshotsFromImages = async (files: FileList | File[]) => {
    const imageFiles = Array.from(files).filter((file) =>
      file.type.startsWith("image/"),
    );
    if (imageFiles.length === 0) return;

    const results = await Promise.all(imageFiles.map(readFileAsDataURL));
    const images = results.filter(
      (src): src is string => typeof src === "string" && src.length > 0,
    );
    if (images.length === 0) return;

    const imported = buildImportedScreenshots({
      base: activeScreenshot,
      textDefaults,
      images,
      generateId,
    });

    setScreenshots([...screenshots, ...imported]);
    setActiveScreenshotId(imported[0].id);
  };

  const handleElementMouseDown = (
    e: React.MouseEvent,
    type: "headline" | "subheadline" | "image" | "device",
    screenshotId: string,
    id?: string,
  ) => {
    e.preventDefault();
    e.stopPropagation();

    const screenshotElement = (e.currentTarget as HTMLElement).closest(
      "[data-screenshot-card='true']",
    );
    if (screenshotElement instanceof HTMLElement) {
      const rect = screenshotElement.getBoundingClientRect();
      dragContainerSize.current = { width: rect.width, height: rect.height };
    } else if (previewRef.current) {
      const rect = previewRef.current.getBoundingClientRect();
      dragContainerSize.current = { width: rect.width, height: rect.height };
    }

    const targetScreenshot =
      screenshots.find((screenshot) => screenshot.id === screenshotId) ??
      activeScreenshot;

    setIsDragging(true);
    setSelectedElement({ type, id, screenshotId });
    if (activeScreenshotId !== screenshotId) {
      setActiveScreenshotIdState(screenshotId);
    }
    dragStartPos.current = { x: e.clientX, y: e.clientY };

    if (type === "device" && id) {
      updateScreenshotById(screenshotId, { activeDeviceId: id });
      const device = targetScreenshot.devices.find((item) => item.id === id);
      if (device) {
        dragStartElementPos.current = { x: device.x, y: device.y };
      }
    } else if (type === "headline") {
      dragStartElementPos.current = {
        x: targetScreenshot.headlineX,
        y: targetScreenshot.headlineY,
      };
    } else if (type === "subheadline") {
      dragStartElementPos.current = {
        x: targetScreenshot.subheadlineX,
        y: targetScreenshot.subheadlineY,
      };
    } else if (type === "image" && id) {
      const image = targetScreenshot.overlayImages.find((img) => img.id === id);
      if (image) {
        dragStartElementPos.current = { x: image.x, y: image.y };
      }
    }
  };

  const applyDragUpdate = useCallback(() => {
    if (!pendingUpdate.current || !selectedElement) return;

    const { x: newX, y: newY } = pendingUpdate.current;

    if (selectedElement.type === "headline") {
      updateScreenshotById(selectedElement.screenshotId, {
        headlineX: newX,
        headlineY: newY,
      });
    } else if (selectedElement.type === "subheadline") {
      updateScreenshotById(selectedElement.screenshotId, {
        subheadlineX: newX,
        subheadlineY: newY,
      });
    } else if (selectedElement.type === "image" && selectedElement.id) {
      const targetScreenshot = screenshots.find(
        (screenshot) => screenshot.id === selectedElement.screenshotId,
      );
      if (!targetScreenshot) return;

      const updatedImages = targetScreenshot.overlayImages.map((img) =>
        img.id === selectedElement.id ? { ...img, x: newX, y: newY } : img,
      );
      updateScreenshotById(selectedElement.screenshotId, {
        overlayImages: updatedImages,
      });
    } else if (selectedElement.type === "device" && selectedElement.id) {
      const targetScreenshot = screenshots.find(
        (screenshot) => screenshot.id === selectedElement.screenshotId,
      );
      if (!targetScreenshot) return;

      const updatedDevices = targetScreenshot.devices.map((device) =>
        device.id === selectedElement.id ? { ...device, x: newX, y: newY } : device,
      );
      updateScreenshotById(selectedElement.screenshotId, {
        devices: updatedDevices,
      });
    }

    pendingUpdate.current = null;
    rafId.current = null;
  }, [screenshots, selectedElement, updateScreenshotById]);

  const handleElementMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging || !selectedElement) return;

      const { width, height } = dragContainerSize.current;
      if (width === 0 || height === 0) return;

      const deltaX = ((e.clientX - dragStartPos.current.x) / width) * 100;
      const deltaY = ((e.clientY - dragStartPos.current.y) / height) * 100;

      const newX = dragStartElementPos.current.x + deltaX;
      const newY = dragStartElementPos.current.y + deltaY;

      pendingUpdate.current = { x: newX, y: newY };

      if (rafId.current === null) {
        rafId.current = requestAnimationFrame(applyDragUpdate);
      }
    },
    [isDragging, selectedElement, applyDragUpdate],
  );

  const handleElementMouseUp = useCallback(() => {
    setIsDragging(false);
    if (rafId.current !== null) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }
    if (pendingUpdate.current) {
      applyDragUpdate();
    }
  }, [applyDragUpdate]);

  // Set up global mouse listeners for dragging
  useEffect(() => {
    if (isDragging) {
      window.addEventListener("mousemove", handleElementMouseMove);
      window.addEventListener("mouseup", handleElementMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", handleElementMouseMove);
      window.removeEventListener("mouseup", handleElementMouseUp);
    };
  }, [isDragging, handleElementMouseMove, handleElementMouseUp]);

  const addOverlayImage = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        const img = new Image();
        img.onload = () => {
          const aspectRatio = img.width / img.height;
          const newImage: ImageOverlay = {
            id: generateId(),
            src: result,
            x: 50,
            y: 50,
            width: 30,
            height: 30 / aspectRatio,
            layer: "front",
            rotation: 0,
            shadow: {
              enabled: false,
              color: "#000000",
              blur: 20,
              offsetX: 0,
              offsetY: 10,
            },
          };
          updateActiveScreenshot({
            overlayImages: [...activeScreenshot.overlayImages, newImage],
          });
          setSelectedElement({
            type: "image",
            id: newImage.id,
            screenshotId: activeScreenshot.id,
          });
        };
        img.src = result;
      }
    };
    reader.readAsDataURL(file);
  };

  const removeOverlayImage = (imageId: string) => {
    const updatedImages = activeScreenshot.overlayImages.filter(
      (img) => img.id !== imageId,
    );
    updateActiveScreenshot({ overlayImages: updatedImages });
    if (
      selectedElement?.type === "image" &&
      selectedElement.screenshotId === activeScreenshot.id &&
      selectedElement.id === imageId
    ) {
      setSelectedElement(null);
    }
  };

  const updateOverlayImageSize = (imageId: string, widthPercent: number) => {
    const image = activeScreenshot.overlayImages.find(
      (img) => img.id === imageId,
    );
    if (!image) return;

    // Use current dimensions to maintain aspect ratio without reloading image
    const aspectRatio = image.width / image.height;

    const updatedImages = activeScreenshot.overlayImages.map((item) =>
      item.id === imageId
        ? {
            ...item,
            width: widthPercent,
            height: widthPercent / aspectRatio,
          }
        : item,
    );
    updateActiveScreenshot({ overlayImages: updatedImages });
  };

  const updateOverlayImageLayer = (
    imageId: string,
    layer: "behind" | "front",
  ) => {
    const updatedImages = activeScreenshot.overlayImages.map((item) =>
      item.id === imageId ? { ...item, layer } : item,
    );
    updateActiveScreenshot({ overlayImages: updatedImages });
  };

  const updateOverlayImageRotation = (imageId: string, rotation: number) => {
    const updatedImages = activeScreenshot.overlayImages.map((item) =>
      item.id === imageId ? { ...item, rotation } : item,
    );
    updateActiveScreenshot({ overlayImages: updatedImages });
  };

  const updateOverlayImageShadow = (
    imageId: string,
    shadow: Partial<ShadowConfig>,
  ) => {
    const updatedImages = activeScreenshot.overlayImages.map((item) =>
      item.id === imageId
        ? { ...item, shadow: { ...item.shadow, ...shadow } }
        : item,
    );
    updateActiveScreenshot({ overlayImages: updatedImages });
  };

  const bringImageForward = (imageId: string) => {
    const images = [...activeScreenshot.overlayImages];
    const index = images.findIndex((img) => img.id === imageId);
    if (index !== -1 && index < images.length - 1) {
      const temp = images[index];
      images[index] = images[index + 1];
      images[index + 1] = temp;
      updateActiveScreenshot({ overlayImages: images });
    }
  };

  const sendImageBackward = (imageId: string) => {
    const images = [...activeScreenshot.overlayImages];
    const index = images.findIndex((img) => img.id === imageId);
    if (index > 0) {
      const temp = images[index];
      images[index] = images[index - 1];
      images[index - 1] = temp;
      updateActiveScreenshot({ overlayImages: images });
    }
  };

  const bringImageToFront = (imageId: string) => {
    const images = [...activeScreenshot.overlayImages];
    const index = images.findIndex((img) => img.id === imageId);
    if (index !== -1 && index < images.length - 1) {
      const [image] = images.splice(index, 1);
      images.push(image);
      updateActiveScreenshot({ overlayImages: images });
    }
  };

  const sendImageToBack = (imageId: string) => {
    const images = [...activeScreenshot.overlayImages];
    const index = images.findIndex((img) => img.id === imageId);
    if (index > 0) {
      const [image] = images.splice(index, 1);
      images.unshift(image);
      updateActiveScreenshot({ overlayImages: images });
    }
  };

  const addDevice = () => {
    const nextDevice = activeDevice
      ? cloneDeviceInstance(activeDevice, {
          id: generateId(),
          x: Math.min(activeDevice.x + 12, 88),
          y: Math.min(activeDevice.y + 4, 70),
        })
      : createDeviceInstance({
          deviceId: selectedDeviceId,
          colorId: selectedColorId,
        });

    updateActiveScreenshot({
      devices: [...activeScreenshot.devices, nextDevice],
      activeDeviceId: nextDevice.id,
    });
    setSelectedElement({
      type: "device",
      id: nextDevice.id,
      screenshotId: activeScreenshot.id,
    });
    setSelectedDeviceIdState(nextDevice.deviceId);
    setSelectedColorIdState(nextDevice.colorId);
  };

  const selectDevice = (deviceId: string) => {
    updateActiveScreenshot({ activeDeviceId: deviceId });
    setSelectedElement({
      type: "device",
      id: deviceId,
      screenshotId: activeScreenshot.id,
    });
  };

  const removeDevice = (deviceId: string) => {
    if (activeScreenshot.devices.length <= 1) return;

    const nextDevices = activeScreenshot.devices.filter(
      (device) => device.id !== deviceId,
    );
    const nextActiveDeviceId =
      activeScreenshot.activeDeviceId === deviceId
        ? nextDevices[Math.max(0, nextDevices.length - 1)].id
        : activeScreenshot.activeDeviceId;

    updateActiveScreenshot({
      devices: nextDevices,
      activeDeviceId: nextActiveDeviceId,
    });

    if (
      selectedElement?.type === "device" &&
      selectedElement.screenshotId === activeScreenshot.id &&
      selectedElement.id === deviceId
    ) {
      setSelectedElement({
        type: "device",
        id: nextActiveDeviceId,
        screenshotId: activeScreenshot.id,
      });
    }
  };

  const bringDeviceForward = (deviceId: string) => {
    const nextDevices = [...activeScreenshot.devices];
    const index = nextDevices.findIndex((device) => device.id === deviceId);
    if (index !== -1 && index < nextDevices.length - 1) {
      const temp = nextDevices[index];
      nextDevices[index] = nextDevices[index + 1];
      nextDevices[index + 1] = temp;
      updateActiveScreenshot({ devices: nextDevices });
    }
  };

  const sendDeviceBackward = (deviceId: string) => {
    const nextDevices = [...activeScreenshot.devices];
    const index = nextDevices.findIndex((device) => device.id === deviceId);
    if (index > 0) {
      const temp = nextDevices[index];
      nextDevices[index] = nextDevices[index - 1];
      nextDevices[index - 1] = temp;
      updateActiveScreenshot({ devices: nextDevices });
    }
  };

  const removeScreenshot = (id: string) => {
    if (screenshots.length <= 1) return;
    const newScreenshots = screenshots.filter((s) => s.id !== id);
    setScreenshots(newScreenshots);
    if (activeScreenshotId === id) {
      setActiveScreenshotId(newScreenshots[0].id);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        updateActiveScreenshot({
          devices: activeScreenshot.devices.map((device) =>
            device.id === activeDevice.id
              ? { ...device, screenshotSrc: result }
              : device,
          ),
        });
      }
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const getBackgroundStyle = (screenshot: Screenshot) => {
    if (screenshot.backgroundMode === "gradient") {
      const preset =
        gradientPresets.find((p) => p.id === screenshot.gradientPresetId) ??
        gradientPresets[0];
      return `linear-gradient(180deg, ${preset.from}, ${preset.to})`;
    }
    return screenshot.backgroundColor;
  };

  const handleExport = async () => {
    setExportProgress({ rendered: 0, total: screenshots.length });
    try {
      await exportScreenshots({
        screenshots,
        exportSize,
        previewDimensions,
        onProgress: (rendered, total) => setExportProgress({ rendered, total }),
      });
    } finally {
      setExportProgress(null);
      setIsStarModalOpen(true);
    }
  };

  /**
   * Resets the editor to default state and clears localStorage
   */
  const resetEditor = () => {
    clearPersistedState();
    const defaultProject = createDefaultProject();
    setProjects([defaultProject]);
    setActiveProjectId(defaultProject.id);
    setSelectedDeviceIdState(defaultProject.selectedDeviceId);
    setSelectedColorIdState(defaultProject.selectedColorId);
    setExportSizeIdState(defaultProject.exportSizeId);
    setScreenshotsState(defaultProject.screenshots);
    setActiveScreenshotIdState(defaultProject.activeScreenshotId);
    setTextDefaultsState(defaultProject.textDefaults);
    setSavedColorsState(defaultProject.savedColors);
    setSelectedElement(null);
    setIsStarModalOpen(false);
    resetHistory({
      screenshots: defaultProject.screenshots,
      textDefaults: defaultProject.textDefaults,
      savedColors: defaultProject.savedColors,
    });
  };

  return (
    <EditorContext.Provider
      value={{
        // Project state
        projects,
        activeProjectId,
        activeProject,
        createProject,
        renameProject,
        deleteProject,
        switchProject,
        exportProject,
        importProject,

        isFontPickerOpen,
        setIsFontPickerOpen,
        fontPickerScope,
        setFontPickerScope,
        isStarModalOpen,
        setIsStarModalOpen,
        isShortcutsOpen,
        setIsShortcutsOpen,
        selectedDeviceId,
        setSelectedDeviceId,
        selectedColorId,
        setSelectedColorId,
        exportSizeId,
        setExportSizeId,
        screenshots,
        setScreenshots,
        activeScreenshotId,
        setActiveScreenshotId,
        selectedElement,
        setSelectedElement,
        isDragging,
        textDefaults,
        setTextDefault,
        setActiveScreenshotText,
        resetActiveScreenshotText,
        savedColors,
        addSavedColor,
        removeSavedColor,
        previewDimensions,
        setPreviewDimensions,
        previewRef,
        fileInputRef,
        canvasContainerRef,
        overlayImageInputRef,
        selectedDevice,
        selectedColor,
        activeScreenshot,
        activeDevice,
        exportSize,
        updateActiveScreenshot,
        addScreenshot,
        addScreenshotsFromImages,
        removeScreenshot,
        handleElementMouseDown,
        handleElementMouseMove,
        handleElementMouseUp,
        addOverlayImage,
        removeOverlayImage,
        updateOverlayImageSize,
        updateOverlayImageLayer,
        updateOverlayImageRotation,
        updateOverlayImageShadow,
        addDevice,
        selectDevice,
        removeDevice,
        bringDeviceForward,
        sendDeviceBackward,
        bringImageForward,
        sendImageBackward,
        bringImageToFront,
        sendImageToBack,
        handleFileUpload,
        handleExport,
        exportProgress,
        getBackgroundStyle,
        resetEditor,
        undo,
        redo,
        canUndo,
        canRedo,
      }}
    >
      {children}
    </EditorContext.Provider>
  );
};

export const useEditor = () => {
  const context = useContext(EditorContext);
  if (context === undefined) {
    throw new Error("useEditor must be used within an EditorProvider");
  }
  return context;
};
