"use client";

import dynamic from "next/dynamic";

export const KeyFindings = dynamic(() => import("./KeyFindings"), { ssr: false });
export const RootCauseAnalysis = dynamic(() => import("./RootCauseAnalysis"), { ssr: false });
export const Charts = dynamic(() => import("./Charts"), { ssr: false });
export const IssuesTable = dynamic(() => import("./IssuesTable"), { ssr: false });
