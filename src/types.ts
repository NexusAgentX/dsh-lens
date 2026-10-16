/**
 * Projection-key home. Imported by host and client so SessionProjectionMap
 * merge is visible on both faces without pulling host-only modules.
 *
 * The data shapes themselves live in `./lens-status.js` (augmentation-free, so
 * the browser half can typecheck against them in isolation); this module adds
 * the host-side projection-key merge on top.
 */

export type {
	LensBlocker,
	LensFileStatus,
	LensLspStatus,
	LensStatus,
	LensFoldState,
} from './lens-status.js';

import type { LensFoldState, LensStatus } from './lens-status.js';

declare module '@deepseek-ai/dsh-session-projection/types' {
	interface SessionProjectionMap {
		/** Live pi-lens diagnostic footer, folded from widget-state on known session events. */
		lens: LensStatus;
	}
	/**
	 * Host fold-state entry for the same key. A client-visible key appears in both
	 * maps; the runtime's client-visible register() overload constrains the state
	 * type via SessionProjectionStateMap while SessionProjectionMap types the wire
	 * view handed to useProjection().
	 */
	interface SessionProjectionStateMap {
		lens: LensFoldState;
	}
}

export type { LensStatus as LensProjection };
