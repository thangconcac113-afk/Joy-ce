"use client";
import { createContext, useContext } from "react";
const Access = createContext(false);
export const AccessProvider = Access.Provider;
export const useCanManage = () => useContext(Access);
