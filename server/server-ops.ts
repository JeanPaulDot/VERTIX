// Runtime server state the admin panel can flip without a restart.
//
// Kept in its own module (rather than a field on index.ts) because both the
// join paths in room.ts and the admin routes in admin.ts need to read it, and
// importing index.ts from either would be circular.

let maintenance = false;

/** Maintenance mode: new game-room joins are refused. Connected players stay. */
export function isMaintenanceEnabled(): boolean {
	return maintenance;
}

export function setMaintenance(enabled: boolean): void {
	maintenance = enabled;
}
