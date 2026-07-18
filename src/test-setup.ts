import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Unmount React trees between tests so rendered DOM never leaks across cases.
afterEach(cleanup);
