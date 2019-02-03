import { FactRecord, FactSignature } from "./storage";

export interface UserIdentity {
    provider: string;
    id: string;
}

export interface Keystore {
    getUserFact(userIdentity: UserIdentity): Promise<FactRecord>;
    getDeviceFact(userIdentity: UserIdentity): Promise<FactRecord>;
    signFact(userIdentity: UserIdentity, fact: FactRecord): Promise<FactSignature>;
}