import {Trace} from "../util/trace";
import {HttpHeaders} from "./authenticationProvider";
import {HttpConnection, HttpResponse} from "./web-client";

interface FetchHttpResponse {
    statusCode: number;
    statusMessage: string | undefined;
    responseType: string;
    response: any;
}

export class FetchConnection implements HttpConnection {
    constructor(
        private url: string,
        private getHeaders: () => Promise<HttpHeaders>,
        private reauthenticate: () => Promise<boolean>
    ) {
    }

    get(path: string): Promise<{}> {
        return Trace.dependency('GET', path, async () => {
            let headers = await this.getHeaders();
            let response = await this.httpGet(path, headers);
            if (response.statusCode === 401 || response.statusCode === 407 || response.statusCode === 419) {
                const retry = await this.reauthenticate();
                if (retry) {
                    headers = await this.getHeaders();
                    response = await this.httpGet(path, headers);
                }
            }
            if (response.statusCode >= 400) {
                throw new Error(response.statusMessage);
            } else if (response.statusCode === 200) {
                if (response.responseType === 'json') {
                    return <{}>response.response;
                } else {
                    return <{}>JSON.parse(response.response);
                }
            } else {
                throw new Error(`Unexpected status code ${response.statusCode}: ${response.statusMessage}`);
            }
        });
    }

    private httpGet(tail: string, headers: HttpHeaders): Promise<FetchHttpResponse> {
        return new Promise<FetchHttpResponse>((resolve, reject) => {
            fetch(this.url + tail, {
                headers: getFetchHeaders(headers)
            })
                .then(response => {
                    resolve({
                        statusCode: response.status,
                        statusMessage: response.statusText,
                        responseType: response.headers.get('Content-Type') || '',
                        response: response.body
                    });
                });
        });
    }

    // getStream(path: string, onResponse: (response: {}) => Promise<void>, onError: (err: Error) => void): () => void {
    //     let closed = false;
    //     this.getHeaders().then(headers => {
    //         if (closed) {
    //             return;
    //         }
    //
    //         const controller = new AbortController();
    //         const signal = controller.signal;
    //
    //         fetch(this.url + path, {
    //             headers: {
    //                 'Accept': 'application/x-jinaga-feed-stream',
    //                 ...headers
    //             },
    //             signal
    //         })
    //             .then(response => {
    //                 if (!response.body) {
    //                     throw new Error('ReadableStream not supported.');
    //                 }
    //
    //                 const reader = response.body.getReader();
    //                 let receivedBytes = 0;
    //                 const decoder = new TextDecoder();
    //
    //                 return reader.read().then(function processText({ done, value }) {
    //                     if (done) {
    //                         return;
    //                     }
    //
    //                     const text = decoder.decode(value, { stream: true });
    //                     const lastNewline = text.lastIndexOf('\n');
    //                     if (lastNewline >= 0) {
    //                         const jsonText = text.substring(0, lastNewline);
    //                         receivedBytes += jsonText.length + 1;
    //                         const lines = jsonText.split(/\r?\n/);
    //                         for (const line of lines) {
    //                             if (line.length > 0) {
    //                                 try {
    //                                     const json = JSON.parse(line);
    //                                     onResponse(json);
    //                                 } catch (err) {
    //                                     onError(err as Error);
    //                                 }
    //                             }
    //                         }
    //                     }
    //
    //                     return reader.read().then(processText);
    //                 });
    //             })
    //             .catch(err => {
    //                 if (err.name === 'AbortError') {
    //                     console.log('Fetch aborted');
    //                 } else {
    //                     onError(new Error('Network request failed.'));
    //                 }
    //             });
    //
    //         return () => {
    //             closed = true;
    //             controller.abort();
    //         };
    //     });
    // }

    getStream(path: string, onResponse: (response: any) => Promise<void>, onError: (err: Error) => void): () => void {
        const controller = new AbortController();
        const signal = controller.signal;



        fetch(this.url + path, {
            method: 'GET',
            headers: {
                'Accept': 'application/x-jinaga-feed-stream'
            },
            signal: signal
        })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response;
            })
            .then(response => {
                const reader = response.body?.getReader();
                if (!reader) {
                    throw new Error('Response body is empty.');
                }
                return reader;
            })
            .then(reader => {
                const decoder = new TextDecoder();
                let bytesReceived = 0;
                let buffer = '';

                return new Promise((resolve, reject) => {
                    const processChunk = (chunk: ReadableStreamDefaultChunkType<'string'>) => {
                        const chunkString = decoder.decode(chunk, {stream: true});
                        buffer += chunkString;

                        const lines = buffer.split('\n');

                        for (let i = 0; i < lines.length; i++) {
                            const line = lines[i].trim();
                            if (line) {
                                try {
                                    const json = JSON.parse(line);
                                    onResponse(json).catch(e => reject(e));
                                } catch (err) {
                                    onError(new Error(`Error parsing JSON: ${(err as any).message}`));
                                }
                            }
                        }

                        bytesReceived += chunkString.length;

                        if (chunk.done) {
                            resolve();
                        }
                    };

                    reader.read().then(processChunk).catch(reject);
                });
            })
            .then(() => {
                // No-op
            })
            .catch(error => {
                onError(error instanceof Error ? error : new Error(String(error)));
            });
        return () => {
            closed = true;
            controller.abort();
        };
    }

    post(path: string, body: {} | string, timeoutSeconds: number): Promise<HttpResponse> {
        return Trace.dependency('POST', path, async () => {
            let headers = await this.getHeaders();
            let response = await this.httpPost(path, headers, body, timeoutSeconds);
            if (response.statusCode === 401 || response.statusCode === 407 || response.statusCode === 419) {
                const reauthenticated = await this.reauthenticate();
                if (reauthenticated) {
                    headers = await this.getHeaders();
                    response = await this.httpPost(path, headers, body, timeoutSeconds);
                }
            }
            if (response.statusCode === 403) {
                throw new Error(response.statusMessage);
            } else if (response.statusCode >= 400) {
                return {
                    result: "retry",
                    error: response.statusMessage || "Unknown error"
                }
            } else if (response.statusCode === 201) {
                return {
                    result: "success",
                    response: {}
                };
            } else if (response.statusCode === 200) {
                if (response.responseType === 'json') {
                    return {
                        result: "success",
                        response: response.response
                    };
                } else {
                    return {
                        result: "success",
                        response: JSON.parse(response.response)
                    };
                }
            } else {
                throw new Error(`Unexpected status code ${response.statusCode}: ${response.statusMessage}`);
            }
        });
    }

    private httpPost(tail: string, headers: HttpHeaders, body: string | {}, timeoutSeconds: number): Promise<FetchHttpResponse> {
        return new Promise<FetchHttpResponse>((resolve, reject) => {
            fetch(this.url + tail, {
                method: 'POST',
                headers: getFetchHeaders(headers),
                body: typeof body === 'string' ? body : JSON.stringify(body)
            })
                .then(response => {
                    if (response.ok) {
                        resolve({
                            statusCode: response.status,
                            statusMessage: response.statusText,
                            responseType: response.headers.get('Content-Type') || '',
                            response: response.body
                        });
                    }

                })
        })

    }

}



function getFetchHeaders(headers: HttpHeaders) {
    const fetchHeaders = new Headers();
    for (const key in headers) {
        const value = headers[key];
        if (value) {
            fetchHeaders.append(key, value);
        }
    }
    return fetchHeaders;
}
