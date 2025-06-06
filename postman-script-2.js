const org = pm.environment.get("ORG");
const env = pm.environment.get("ENV");
const token = pm.environment.get("apigee_access_token");
var count = 0;

let getAsyncDeployments = function(proxy) {
    console.log('Getting deployments for proxy ' + proxy);
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
                var deployments = res.json();
                if (deployments.environment) {
                    deployments.environment.forEach(async(e) => {
                        if (e.name === env) {
                            let revisions = e.revision;
                            let revision = revisions[0].name;
                            await getAsyncFlows(proxy, revision); // Fixed function name
                        }
                    });
                }
                resolve(res);
            }
        );
    });
};

let getAsyncFlows = function(proxy, revision) {
    console.log('Getting flows for proxy ' + proxy);
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
                var data = res.json();
                var flows = data.flows || [];
                let flowsCount = flows.length;
                console.log("Total flows " + flowsCount);
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
                        let notFond = flowName.match(/Not Found/);
                        let raiseInvalid = flowName.match(/Raise Invalid/);
                        if (!notFond && !raiseInvalid) {
                            validFlow = true;
                        }
                    }
                    if (validFlow) {
                        flowNumber = flowNumber + 1;
                        createEndpoints(endpoints, f, host, basePath);
                    } else {
                        flowsCount = flowsCount - 1;
                    }
                });
                console.log("Total endpoints " + flowsCount);
                prepareData(endpoints);
                resolve();
            }
        );
    });
};

async function runIt() {
    var data = pm.response.json();
    if (Array.isArray(data)) {
        data.forEach(async(i) => {
            if (i === "natwest-mortgages") {
                await getAsyncDeployments(i);
            }
        });
    }
}

runIt();


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
    if (paths && paths.length > 1) {
        // console.log("Multiple paths found in condition: ");
        paths.forEach((p, index) => {
            var endpoint = {};
            p = p.replace(/"/g, ""); // Removes all occurrences of "
            p = p.replace(/\)/g, ""); // Removes all occurrences of ")"
            let url = "https://" + host + basePath + p;
            endpoint.url = url;
            endpoints.push(endpoint);
            console.log("Url: " + url);
        });
    }
}

function prepareData(endpoints) {
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


// extract all substrings that come after a matching string (e.g., MatchesPath ") until the next double quote, for all occurrences in a string, using this function:
function extractAllAfterUntilQuote(text, start) {
    const regex = new RegExp(`${start}([^"]*)`, "g");
    const matches = [];
    let match;
    while ((match = regex.exec(text)) !== null) {
        matches.push(match[1]);
    }
    return matches;
}