const fs = require("fs");
const path = require("path");
const slugify = require("slugify");

// NOTE: This file helps create some json files that contain the client
//       versioned queries for persisted use. The generated files are:
//       ./build/persisted_queries_ids.json and ./build/persisted_queries.json

const OUTPUT_FILE = path.resolve("build", "persisted_queries.json");
const OUTPUT_FILE2 = path.resolve("build", "persisted_queries_ids.json");
const INPUT_DIR = path.resolve("src", "clients");

const queryFiles = dir => fs.readdirSync(dir).reduce((files, file) => {
    if (fs.statSync(path.join(dir, file)).isDirectory()) {
        return files.concat(queryFiles(path.join(dir, file)))
    } else {
        return /.graphql$/i.test(file)
            ? files.concat(path.join(dir, file))
            : files;
    } 
}, []);

const getQueryIdMapping = (obj, queryFilePath) => {
    const persistedQueryName = slugify(
        queryFilePath.replace(path.join(__dirname, 'src', 'clients', '/'), '')
    );
    return (Object.assign({}, obj, {
        [persistedQueryName]: fs.readFileSync(queryFilePath).toString(),
    }));
};

const fileContentMap = queryFiles(INPUT_DIR).reduce(getQueryIdMapping, {});
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(fileContentMap, null, 2));

const persistedQueriesIds = {};
Object.keys(fileContentMap).forEach(k => {
    persistedQueriesIds[k] = k;
});
fs.writeFileSync(OUTPUT_FILE2, JSON.stringify(persistedQueriesIds, null, 2));
