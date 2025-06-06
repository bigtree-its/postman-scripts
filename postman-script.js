const org = pm.environment.get("ORG");
const env = pm.environment.get("ENV");
const token = pm.environment.get("apigee_access_token");
const proxyName = "ulsterni-";

let getAsyncDeployments = function(proxy) {
    console.log("Processing proxy: " + proxy);
    return new Promise((resolve, reject) => {
        pm.sendRequest({
                url: "https://api.enterprise.apigee.com/v1/organizations/" +
                    org +
                    "/apis/" +
                    proxy +
                    "/deployments",
                method: "GET",
                header: {
                    Authorization: "Bearer " + token,
                },
            },
            (error, res) => {
                if (error) {
                    console.error(error);
                    return reject(error);
                }
                // setTimeout(resolve(res), 1);
                var deployments = res.json();
                // Check if deployments.environment is an array and has elements
                if (!Array.isArray(deployments.environment) || deployments.environment.length === 0) {
                    console.error("No environments found in deployments for proxy " + proxy);
                    return reject(new Error("No environments found in deployments."));
                }
                // Iterate through the environments to find the one matching 'env'
                // and process the revisions
                if (!env) {
                    console.error("Environment variable 'env' is not set.");
                    return reject(new Error("Environment variable 'env' is not set."));
                }
                if (!deployments.environment.some(e => e.name === env)) {
                    console.error(`Environment '${env}' not found in deployments for proxy '${proxy}'.`);
                    return reject(new Error(`Environment '${env}' not found in deployments.`));
                }
                // Proceed with processing the revisions for the specified environment
                console.log(`Processing deployments for environment: '${env}' for proxy '${proxy}'`);
                // Use forEach to iterate through the environments
                // and find the matching environment
                // Note: Using async/await inside forEach is not recommended, so we use a regular forEach here
                // but we can use an async function to handle the asynchronous calls
                // Iterate through the deployments to find the matching environment
                // and process the revisions
                deployments.environment.forEach(async(e) => {
                    if (e.name === env) {
                        let revisions = e.revision;
                        let revision = revisions[0].name;
                        await getAsyncFlows(proxy, revision);
                        resolve(res); // Resolve the promise after processing all revisions
                    }
                });
            }
        );
    });
};

let getAsyncFlows = function(proxy, revision) {
    return new Promise((resolve, reject) => {
        pm.sendRequest({
                url: "https://api.enterprise.apigee.com/v1/organizations/" +
                    org +
                    "/apis/" +
                    proxy +
                    "/revisions/" +
                    revision +
                    "/proxies/default",
                method: "GET",
                header: {
                    Authorization: "Bearer " + token,
                },
            },
            (error, res) => {
                if (error) {
                    console.error(error);
                    return reject(error);
                }
                // setTimeout(resolve(res), 1);
                var data = res.json();
                var flows = data.flows;
                let flowsCount = flows.length;
                console.log("Found " + flowsCount + " flows in proxy " + proxy);
                let basePath = data.connection.basePath;
                let vhArray = data.connection.virtualHost;
                let vh = vhArray[0];
                let host = pm.environment.get("vh_" + vh);
                let endpoints = [];
                let flowNumber = 1;
                flows.forEach((f) => {
                    let validFlow = false;
                    if (f.name) {
                        let flowName = f.name.trim();
                        flowName = flowName.replace(/(\r\n|\n|\r)/gm, "");
                        // console.log("Name: " + flowName);
                        let notFond = flowName.match(/Not Found/);
                        let raiseInvalid = flowName.match(/Raise Invalid/);
                        if (!notFond && !raiseInvalid) {
                            validFlow = true;
                        }
                    }
                    if (validFlow) {
                        // console.log("Valid Flow " + flowNumber);
                        flowNumber = flowNumber + 1;
                        createEndpoints(endpoints, f, host, basePath);
                    } else {
                        flowsCount = flowsCount - 1;
                    }
                });
                //remove duplicates from endpoints array
                endpoints = endpoints.map(ep => JSON.stringify(ep)); // Convert objects to strings for uniqueness
                endpoints = [...new Set(endpoints)];
                console.log("Found " + endpoints.length + " endpoints in proxy " + proxy);
                if (endpoints.length === 0) {
                    // If no valid endpoints are found in this proxy, log an error and reject the promise 
                    return reject(new Error("No valid endpoints found in proxy " + proxy));
                } else {
                    prepareData(endpoints);
                    resolve(res); // Resolve the promise after processing all flows
                }
            }
        );
    });
};

async function runIt() {
    var data = pm.response.json();
    data.forEach(async(i) => {
        if (i.startsWith(proxyName)) {
            // Call the asynchronous function to get deployments for each proxy
            await getAsyncDeployments(i);
        }
    });
}

runIt();




//extract all substrings that come after a matching string (e.g., MatchesPath ") until the next double quote, for all occurrences in a string, using this function:
function extractAllAfterUntilQuote(text, start) {
    const regex = new RegExp(`${start}([^"]*)`, "g");
    const matches = [];
    let match;
    while ((match = regex.exec(text)) !== null) {
        matches.push(match[1]);
    }
    return matches;
}

function countOccurrences(str, search) {
    return (str.match(new RegExp(search, "g")) || []).length;
}

function createEndpoints(endpoints, flow, host, basePath) {
    if (!flow.condition) {
        return; //skip flows without condition
    }
    let condition = flow.condition.trim();
    condition = condition.replace(/(\r\n|\n|\r)/gm, "");
    // console.log("Creating url from " + condition);

    let startStr = 'MatchesPath "';
    let paths = extractAllAfterUntilQuote(condition, startStr);
    if (!paths || paths.length === 0) {
        // console.log("No path found in condition: " + condition);
        return null; // No path found, skip this flow
    }
    if (paths && paths.length > 0) {
        // console.log("Multiple paths found in condition: ");
        paths.forEach((p, index) => {
            p = p.replace(/"/g, ""); // Removes all occurrences of "
            p = p.replace(/\)/g, ""); // Removes all occurrences of ")"
            let url = "https://" + host + basePath + p;
            url = url.replace(/"/g, "");
            // check if the url already exists in the endpoints array
            let existingEndpoint = endpoints.find(ep => ep === url);
            if (!existingEndpoint) {
                endpoints.push(url);
            }
        });
    }
    return endpoints; // Return the endpoints array for further processing if needed
}

// Function to prepare data for CSV output
function prepareData(endpoints) {

    // Create an array of objects with the required properties
    const csvHeaders = ["URL"];
    const csvObjects = endpoints.map((ep) => {
        return {
            URL: ep
        };
    });
    // Convert the array of objects to an array of arrays for CSV format
    endpoints = csvObjects.map(obj => {
        return csvHeaders.map(header => obj[header]);
    });
    // Add headers to the CSV data
    endpoints.unshift(csvHeaders); // Add headers at the beginning of the array
    // Convert the array of arrays to a CSV string

    const csvData = [];
    endpoints.forEach((ep) => {
        csvData.push(Object.values(ep));
    });
    let csvContent = "";
    csvData.forEach((d) => {
        csvContent += d.join(",") + "\n";
    });
    writeToCsv(csvContent);
}

function extractUntilQuote(text, start) {
    let regex = new RegExp(`${start}([^"]*)`);
    let match = text.match(regex);
    return match ? match[1] : ""; // Returns the extracted text or an empty string if no match is found
}

function writeToCsv(content) {
    pm.sendRequest({
            url: "http://localhost:3000/endpoints",
            method: "POST",
            header: "Content-Type:application/x-www-form-urlencoded",
            body: {
                mode: "urlencoded",
                urlencoded: `payload=${content}`,
            },
        },
        function(err, res) {
            console.log(res);
        }
    );
}

function extractAfterUntilQuote(text, start) {
    const startIndex = text.indexOf(start);
    if (startIndex === -1) return null;
    const fromIndex = startIndex + start.length;
    const endIndex = text.indexOf('"', fromIndex);
    if (endIndex === -1) return null;

    return text.substring(startIndex + start.length, endIndex).trim();
}

function extractBetween(text, start, end) {
    const startIndex = text.indexOf(start);
    if (startIndex === -1) return null;
    const endIndex = text.indexOf(end, startIndex + start.length);
    if (endIndex === -1) return null;

    return text.substring(startIndex + start.length, endIndex).trim();
}

function extractPath(text, start, end1, end2) {
    let regex = new RegExp(`${start}(.*?)(?:${end1}|${end2})`);
    let match = text.match(regex);
    return match ? match[1] : "";
}

function extractVerb(text, match) {
    let index = text.indexOf(match);
    if (index !== -1) {
        let v = text.slice(index + match.length);
        // extract only letters from sliced string
        return v.replace(/[^a-zA-Z]/g, "");
    }
    return ""; // Return an empty string if match isn't found
}


function getDeployments(proxy) {
    pm.sendRequest({
            url: "https://api.enterprise.apigee.com/v1/organizations/" +
                org +
                "/apis/" +
                proxy +
                "/deployments",
            method: "GET",
            header: {
                Authorization: "Bearer " + token,
            },
        },
        function(err, res) {
            pm.test("Body matches string", function() {
                pm.expect(res.text()).to.include("string_you_want_to_search");
            });
            var deployments = res.json();
            deployments.environment.forEach((e) => {
                if (e.name === env) {
                    let revisions = e.revision;
                    let revision = revisions[0].name;
                    getFlows(proxy, revision);
                }
            });
        }
    );
}

function getFlows(proxy, revision) {
    pm.sendRequest({
            url: "https://api.enterprise.apigee.com/v1/organizations/" +
                org +
                "/apis/" +
                proxy +
                "/revisions/" +
                revision +
                "/proxies/default",
            method: "GET",
            header: {
                Authorization: "Bearer " + token,
            },
        },
        (err, res) => {
            var data = res.json();
            var flows = data.flows;
            let flowsCount = flows.length;
            let basePath = data.connection.basePath;
            let vhArray = data.connection.virtualHost;
            let vh = vhArray[0];
            let host = pm.environment.get("vh_" + vh);
            let endpoints = [];
            let flowNumber = 1;
            flows.forEach((f) => {
                let validFlow = false;
                if (f.name) {
                    let flowName = f.name.trim();
                    flowName = flowName.replace(/(\r\n|\n|\r)/gm, "");
                    // console.log("Name: " + flowName);
                    let notFond = flowName.match(/Not Found/);
                    let raiseInvalid = flowName.match(/Raise Invalid/);
                    if (!notFond && !raiseInvalid) {
                        validFlow = true;
                    }
                }
                if (validFlow) {
                    // console.log("Valid Flow " + flowNumber);
                    flowNumber = flowNumber + 1;
                    createEndpoints(endpoints, f, host, basePath);
                } else {
                    flowsCount = flowsCount - 1;
                }
            });
            prepareData(endpoints);
        }
    );
}