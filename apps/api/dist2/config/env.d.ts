export type AppEnv = ReturnType<typeof parseEnv>;
export declare function parseEnv(input: NodeJS.ProcessEnv): {
    nodeEnv: "development" | "test" | "production";
    databaseUrl: string;
    server: {
        host: string;
        port: number;
    };
    jwt: {
        secret: string;
        expiresIn: string;
        refreshExpiresIn: string;
    };
    storage: {
        driver: "local" | "s3";
        localDir: string;
        s3: {
            endpoint: string | undefined;
            region: string | undefined;
            bucket: string | undefined;
            accessKeyId: string | undefined;
            secretAccessKey: string | undefined;
        };
    };
    providers: {
        ocr: {
            provider: "none" | "http";
            endpoint: string | undefined;
            apiKey: string | undefined;
        };
        llm: {
            provider: "none" | "langchain" | "openai-compatible" | "openai-responses";
            model: string;
            baseUrl: string | undefined;
            apiKey: string | undefined;
            openAiApiKey: string | undefined;
        };
    };
    lims: {
        baseUrl: string;
        clinicalInfoEndpoint: string;
        apiToken: string;
        timeoutMs: number;
    };
};
export declare function loadEnv(): {
    nodeEnv: "development" | "test" | "production";
    databaseUrl: string;
    server: {
        host: string;
        port: number;
    };
    jwt: {
        secret: string;
        expiresIn: string;
        refreshExpiresIn: string;
    };
    storage: {
        driver: "local" | "s3";
        localDir: string;
        s3: {
            endpoint: string | undefined;
            region: string | undefined;
            bucket: string | undefined;
            accessKeyId: string | undefined;
            secretAccessKey: string | undefined;
        };
    };
    providers: {
        ocr: {
            provider: "none" | "http";
            endpoint: string | undefined;
            apiKey: string | undefined;
        };
        llm: {
            provider: "none" | "langchain" | "openai-compatible" | "openai-responses";
            model: string;
            baseUrl: string | undefined;
            apiKey: string | undefined;
            openAiApiKey: string | undefined;
        };
    };
    lims: {
        baseUrl: string;
        clinicalInfoEndpoint: string;
        apiToken: string;
        timeoutMs: number;
    };
};
//# sourceMappingURL=env.d.ts.map