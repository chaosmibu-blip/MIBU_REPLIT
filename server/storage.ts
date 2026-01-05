import { storage as modularStorage } from "./storage/index";

export const storage = modularStorage;
export type IStorage = typeof storage;
