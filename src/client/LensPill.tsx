/// <reference path="../css-modules.d.ts" />

import { useState } from 'react';
import {
	IconCheckOutlineRegular,
	IconChevronDownOutlineRegular,
	IconSearchOutlineRegular,
	Menu,
} from '@deepseek-ai/dsh-client-ui-primitives';
import { lensPillState, type LensPillTier } from '../lens-display.js';
import { chipLabel, openPath } from './counts.js';
import css from './LensPill.module.css';
import { translate, type Translate } from './locales.js';
import { buildLensMenuItems, resolveMenuTarget } from './menu-items.js';
import { readLensStatus } from './status-view.js';

interface PillProps {
	useProjection?: (key: string) => unknown;
	openFile?: (path: string, line?: number) => void;
	t?: Translate;
}

const TIER_CLASS: Record<LensPillTier, string> = {
	blocking: css.blocking,
	errors: css.errors,
	warnings: css.warnings,
	failedLsp: css.failed,
};

/**
 * The dsh-lens entry in `conversation.composer.dock`: a peer of the cache-hit
 * and context pills in the composer usage row. It shows the pi-lens tiers as
 * compact counts and a checkmark once a workspace is known clean; the full
 * file/blocker breakdown lives behind the menu.
 */
export function LensPill({ useProjection, openFile, t = translate }: PillProps) {
	const status = readLensStatus(useProjection);
	const [open, setOpen] = useState(false);
	const state = status ? lensPillState(status) : undefined;
	if (!status || !state || state.kind === 'off') return null;

	const label = chipLabel(status, t);

	return (
		<span className={css.anchor} data-composer-stat="lens">
			<Menu
				open={open}
				onClose={() => setOpen(false)}
				items={buildLensMenuItems(status, t)}
				onSelect={(id) => {
					const target = resolveMenuTarget(status, id);
					if (target) openPath(openFile, target.path, target.line);
					setOpen(false);
				}}
				portal
				compact
				align="end"
				side="top"
				anchor={
					<button
						type="button"
						className={css.pill}
						aria-expanded={open}
						aria-label={label}
						title={label}
						onClick={() => setOpen((current) => !current)}
					>
						<IconSearchOutlineRegular size={14} />
						{state.kind === 'idle' && <span className={css.label}>{t('chip.idle')}</span>}
						{state.kind === 'clean' && (
							<>
								<IconCheckOutlineRegular size={14} className={css.ok} />
								<span className={css.label}>{t('chip.clean')}</span>
							</>
						)}
						{state.kind === 'counts' &&
							state.counts.map((count) => (
								<span key={count.tier} className={`${css.count} ${TIER_CLASS[count.tier]}`}>
									{count.text}
								</span>
							))}
						<IconChevronDownOutlineRegular
							size={12}
							className={open ? `${css.caret} ${css.caretOpen}` : css.caret}
						/>
					</button>
				}
			/>
		</span>
	);
}
