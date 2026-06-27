/**
 * Mission Systems Identity Service
 * --------------------------------
 * Organization: LHS Legacy LLC
 * Project: GoodMorningAI
 * Framework: Mission Systems
 *
 * Purpose:
 * Generates and validates Mission Systems Identifiers (MSIDs).
 */

export type ObjectType =
  | "Knowledge"
  | "Mission"
  | "Research"
  | "Evidence"
  | "Pattern"
  | "Relationship"
  | "Action"
  | "Workspace"
  | "Organization"
  | "Person"
  | "Software"
  | "Experiment"
  | "Dataset"
  | "Publication"
  | "Policy"
  | "Standard"
  | "API";

const PREFIX: Record<ObjectType, string> = {
  Knowledge: "KNW",
  Mission: "MIS",
  Research: "RES",
  Evidence: "EVD",
  Pattern: "PAT",
  Relationship: "REL",
  Action: "ACT",
  Workspace: "WSP",
  Organization: "ORG",
  Person: "PER",
  Software: "SFT",
  Experiment: "EXP",
  Dataset: "DAT",
  Publication: "PUB",
  Policy: "POL",
  Standard: "STD",
  API: "API"
};

export class IdentityService {
  generate(type: ObjectType, sequence: number): string {
    const year = new Date().getFullYear();
    const id = String(sequence).padStart(6, "0");
    return `MS-${year}-${PREFIX[type]}-${id}`;
  }

  validate(msid: string): boolean {
    return /^MS-\d{4}-[A-Z]{3}-\d{6}$/.test(msid);
  }

  parse(msid: string) {
    if (!this.validate(msid)) {
      throw new Error("Invalid MSID");
    }

    const [, year, type, sequence] =
      msid.match(/^MS-(\d{4})-([A-Z]{3})-(\d{6})$/)!;

    return {
      year: Number(year),
      type,
      sequence: Number(sequence)
    };
  }
}

export const identityService = new IdentityService();
