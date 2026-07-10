function asProfileValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

export function accountProfileFields(
  profile: Record<string, unknown>,
): Record<string, unknown> {
  return {
    display_name: asProfileValue(profile.display_name),
    email: asProfileValue(profile.email),
    timezone: asProfileValue(profile.timezone),
  };
}

export function profileResourceFields(
  profile: Record<string, unknown>,
): Record<string, string | null> {
  return {
    display_name: asProfileValue(profile.display_name),
    role: asProfileValue(profile.role),
    interests: asProfileValue(profile.interests),
    instructions: asProfileValue(profile.instructions),
    timezone: asProfileValue(profile.timezone),
  };
}
