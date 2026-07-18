/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);
import { GITHUB_REPO_URL } from "../constants";
import { GitHubStarModal } from "./GitHubStarModal";

describe("GitHubStarModal", () => {
  it("does not render when closed", () => {
    render(<GitHubStarModal isOpen={false} onClose={vi.fn()} />);

    expect(
      screen.queryByRole("heading", { name: /enjoying the export/i }),
    ).toBeNull();
  });

  it("renders the GitHub url and closes from the dismiss button", () => {
    const onClose = vi.fn();

    render(<GitHubStarModal isOpen onClose={onClose} />);

    expect(
      screen.getByRole("heading", { name: /enjoying the export/i }),
    ).not.toBeNull();

    const link = screen.getByRole("link", { name: GITHUB_REPO_URL });
    expect(link.getAttribute("href")).toBe(GITHUB_REPO_URL);

    fireEvent.click(screen.getByRole("button", { name: /maybe later/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes when the backdrop is clicked but not the dialog body", () => {
    const onClose = vi.fn();
    render(<GitHubStarModal isOpen onClose={onClose} />);

    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();

    const backdrop = screen.getByRole("dialog").parentElement as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
