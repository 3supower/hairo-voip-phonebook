const express = require('express');
const fs = require('fs');
const path = require('path');
const morgan = require('morgan');
const ldap = require('ldapjs');
const { google } = require('googleapis');
const { OAuth2 } = google.auth;

const app = express();
const PORT = process.env.PORT || 3000;
const LDAP_PORT = process.env.LDAP_PORT || 3890;
const LDAP_BASE_DN = 'dc=contacts,dc=local';

// Use morgan to log requests to the console
app.use(morgan('dev'));

// Load client secrets from a local file.
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const TOKEN_PATH = path.join(__dirname, 'token.json');

// Scopes for Google Contacts API
const SCOPES = ['https://www.googleapis.com/auth/contacts.readonly'];

async function getGoogleContacts() {
    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
    const { client_secret, client_id, redirect_uris } = credentials.installed;
    const oAuth2Client = new OAuth2(client_id, client_secret, redirect_uris[0]);

    // Check if we have previously stored a token.
    if (fs.existsSync(TOKEN_PATH)) {
        const token = fs.readFileSync(TOKEN_PATH);
        oAuth2Client.setCredentials(JSON.parse(token));
    } else {
        // Get new token
        const authUrl = oAuth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: SCOPES,
        });
        console.log('Authorize this app by visiting this url:', authUrl);
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });
        const code = await new Promise((resolve) => {
            rl.question('Enter the code from that page here: ', (code) => {
                resolve(code);
            });
        });
        rl.close();
        const { tokens } = await oAuth2Client.getToken(code);
        oAuth2Client.setCredentials(tokens);
        // Store the token to disk for later program executions
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
        console.log('Token stored to', TOKEN_PATH);
    }

    const service = google.people({ version: 'v1', auth: oAuth2Client });
    let connections = [];
    let pageToken = null;

    do {
        const res = await service.people.connections.list({
            resourceName: 'people/me',
            pageSize: 1000,
            personFields: 'names,phoneNumbers,emailAddresses',
            pageToken: pageToken,
        });

        connections = connections.concat(res.data.connections || []);
        pageToken = res.data.nextPageToken;
    } while (pageToken);

    const contacts = connections.map((person) => {
        const names = person.names || [];
        const phoneNumbers = person.phoneNumbers || [];
        const emails = person.emailAddresses || [];
        return {
            firstName: names[0] ? names[0].givenName : '',
            lastName: names[0] ? names[0].familyName : '',
            phoneNumber: phoneNumbers[0] ? phoneNumbers[0].value : '',
            email: emails[0] ? emails[0].value : '',
        };
    });

    return contacts;
}

// ---------------------------------------------------------------------------
// Contact cache
// Google Contacts is fetched at most once per CACHE_TTL; the XML endpoints and
// the LDAP server all read from this cache instead of hitting Google directly.
// ---------------------------------------------------------------------------
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

const contactCache = {
    contacts: [],
    fetchedAt: 0,
    refreshing: null, // in-flight refresh promise, so concurrent callers share one fetch
};

// Google sometimes hands back missing names or the literal string "undefined"
function cleanName(value) {
    const s = value == null ? '' : String(value).trim();
    return s === 'undefined' || s === 'null' ? '' : s;
}

function normalizeContacts(rawContacts) {
    return rawContacts.map((c) => ({
        firstName: cleanName(c.firstName),
        lastName: cleanName(c.lastName),
        phoneNumber: (c.phoneNumber || '').trim(),
        email: (c.email || '').trim(),
    }));
}

async function refreshContacts() {
    if (contactCache.refreshing) return contactCache.refreshing;

    contactCache.refreshing = (async () => {
        try {
            const raw = await getGoogleContacts();
            contactCache.contacts = normalizeContacts(raw);
            contactCache.fetchedAt = Date.now();
            console.log(`[cache] Refreshed ${contactCache.contacts.length} contacts from Google`);
            return contactCache.contacts;
        } finally {
            contactCache.refreshing = null;
        }
    })();

    return contactCache.refreshing;
}

async function getCachedContacts() {
    const fresh = contactCache.contacts.length > 0
        && Date.now() - contactCache.fetchedAt < CACHE_TTL;
    if (fresh) return contactCache.contacts;

    try {
        return await refreshContacts();
    } catch (err) {
        if (contactCache.contacts.length > 0) {
            console.error('[cache] Refresh failed, serving stale contacts:', err.message);
            return contactCache.contacts;
        }
        throw err;
    }
}

setInterval(() => {
    refreshContacts().catch((err) => console.error('[cache] Scheduled refresh failed:', err.message));
}, CACHE_TTL);

app.get('/generate-phonebook/phonebook.xml', async (req, res) => {
    const now = new Date();
    console.log(`Generating phonebook at ${now.toLocaleString()}...`);
    const googleContacts = await getCachedContacts();
    console.log(`Number of contacts: ${googleContacts.length}`);

    let phonebookData = `
    <?xml version="1.0" encoding="UTF-8"?>
    <AddressBook>
        <pbgroup>
            <id>1</id>
            <name>Blocklist</name>
        </pbgroup>
        <pbgroup>
            <id>2</id>
            <name>Allowlist</name>
        </pbgroup>
        <pbgroup>
            <id>26</id>
            <name>Blacklist</name>
        </pbgroup>
        <pbgroup>
            <id>27</id>
            <name>Whitelist</name>
        </pbgroup>
        <pbgroup>
            <id>192</id>
            <name>Default</name>
            <ringtones>ring3.bin</ringtones>
            <RingtoneIndex>3</RingtoneIndex>
        </pbgroup>
        <pbgroup>
            <id>193</id>
            <name>Customer</name>
            <ringtones>ring3.bin</ringtones>
            <RingtoneIndex>3</RingtoneIndex>
        </pbgroup>
        <Contact>
            <id>209503</id>
            <FirstName>Aaron</FirstName>
            <LastName>Au</LastName>
            <RingtoneIndex>0</RingtoneIndex>
            <RingtoneUrl>system</RingtoneUrl>
            <Frequent>0</Frequent>
            <Phone type="Home">
                <phonenumber>0425352106</phonenumber>
                <accountindex>2</accountindex>
            </Phone>
            <Primary>0</Primary>
            <Mail>aaronau90@gmail.com</Mail>
            <Department/>
        </Contact>
        <Contact>
            <id>209504</id>
            <FirstName>Aaron</FirstName>
            <LastName>Griffith</LastName>
            <RingtoneIndex>0</RingtoneIndex>
            <RingtoneUrl>system</RingtoneUrl>
            <Frequent>0</Frequent>
            <Phone type="Home">
                <phonenumber>0473464925</phonenumber>
                <accountindex>2</accountindex>
            </Phone>
            <Primary>0</Primary>
            <Mail/>
            <Department/>
        </Contact>
        <Contact>
            <id>209899</id>
            <FirstName>Hyun</FirstName>
            <LastName>Choi</LastName>
            <RingtoneIndex>3</RingtoneIndex>
            <RingtoneUrl>ring3.bin</RingtoneUrl>
            <Frequent>0</Frequent>
            <Phone type="Work">
                <phonenumber>0430139124</phonenumber>
                <accountindex>0</accountindex>
            </Phone>
            <Group>193</Group>
            <Primary>0</Primary>
            <Mail>3supower@gmail.com</Mail>
        </Contact>
    `;

    googleContacts.forEach((contact, index) => {
        phonebookData += `
        <Contact>
            <id>${210000 + index}</id>
            <FirstName>${contact.firstName}</FirstName>
            <LastName>${contact.lastName}</LastName>
            <RingtoneIndex>3</RingtoneIndex>
            <RingtoneUrl>ring3.bin</RingtoneUrl>
            <Frequent>0</Frequent>
            <Phone type="Work">
                <phonenumber>${contact.phoneNumber}</phonenumber>
                <accountindex>1</accountindex>
            </Phone>
            <Group>193</Group>
            <Primary>0</Primary>
            <Mail>${contact.email}</Mail>
            <Department/>
        </Contact>
        `;
    });

    phonebookData += `
    </AddressBook>
    `;

    // Write the XML data to a file
    const filePath = path.join(__dirname, 'phonebook.xml');
    fs.writeFileSync(filePath, phonebookData.trim());
    console.log('Phonebook generated successfully.');

    // res.set('Content-Type', 'application/xml');
    // res.set('Content-Disposition', 'attachment; filename="phonebook.xml"');
    // res.sendFile(filePath);

    // res.send('Phonebook generated successfully. You can access it at /generate-phonebook/phonebook.xml');
    res.sendFile(filePath);
});

// Serve the phonebook.xml file
app.get('/generate-phonebook/remote-phonebook.xml', async (req, res) => {
    const now = new Date();
    console.log(`Generating Yealink Remote phonebook at ${now.toLocaleString()}...`);
    const googleContacts = await getCachedContacts();
    console.log(`Number of contacts: ${googleContacts.length}`);

    let phonebookData = `
    <?xml version="1.0" encoding="UTF-8"?>
    <YealinkIPPhoneDirectory>
        <DirectoryEntry>
	    <Name>Test Test</Name>
            <Telephone>12345</Telephone>
        </DirectoryEntry>
    `;
    
    googleContacts.forEach((contact, index) => {
        phonebookData += `
        <DirectoryEntry>
            <Name>${contact.firstName} ${contact.lastName}</Name>
            <Telephone>${contact.phoneNumber}</Telephone>
        </DirectoryEntry>
        `;
    });

    phonebookData += `
    </YealinkIPPhoneDirectory>
    `;

    // Write the XML data to a file
    const filePath = path.join(__dirname, 'remote-phonebook.xml');
    fs.writeFileSync(filePath, phonebookData.trim());
    console.log('Yealink Remote Phonebook generated successfully.');
    res.sendFile(filePath);
});

// ---------------------------------------------------------------------------
// LDAP server for Grandstream GRP2624
// The phone queries per-search instead of downloading the whole phonebook,
// which sidesteps the 2,000-entry XML limit.
// ---------------------------------------------------------------------------
const LDAP_MAX_RESULTS = 200;
const LDAP_MIN_TERM_LENGTH = 2;

// LDAP entries are rebuilt only when the underlying contact cache changes
const ldapEntryCache = { builtAt: -1, entries: [] };

function buildLdapEntries(contacts) {
    if (ldapEntryCache.builtAt === contactCache.fetchedAt) return ldapEntryCache.entries;

    const entries = [];
    contacts.forEach((contact, index) => {
        if (!contact.phoneNumber) return; // no number → useless on a phone

        const fullName = `${contact.firstName} ${contact.lastName}`.trim() || contact.phoneNumber;
        const attributes = {
            objectclass: ['inetOrgPerson'],
            uid: `g${index}`,
            cn: fullName,
            // inetOrgPerson requires sn, so fall back to the full name
            sn: contact.lastName || fullName,
            telephoneNumber: contact.phoneNumber,
        };
        if (contact.firstName) attributes.givenName = contact.firstName;
        if (contact.email) attributes.mail = contact.email;

        // Lowercased copy for case-insensitive filter matching
        const lower = {};
        for (const [key, value] of Object.entries(attributes)) {
            lower[key.toLowerCase()] = Array.isArray(value) ? value[0] : value;
        }

        entries.push({ dn: `uid=g${index},${LDAP_BASE_DN}`, attributes, lower });
    });

    ldapEntryCache.builtAt = contactCache.fetchedAt;
    ldapEntryCache.entries = entries;
    return entries;
}

// Phone numbers are compared digits-only so "0430 139 124" matches "0430139124"
function normalizeForMatch(value, attrName) {
    const s = String(value).toLowerCase();
    return attrName === 'telephonenumber' ? s.replace(/[\s\-().+]/g, '') : s;
}

// NOTE: ldapjs v3 filter objects expose `filters` as [] and `filter` as a
// self-reference even on leaf filters, so branching must be driven by the
// type string ('AndFilter', 'OrFilter', 'NotFilter', 'SubstringFilter', ...)
function matchesFilter(filter, lowerAttrs) {
    const type = String(filter.type || '').toLowerCase();

    if (type.startsWith('not')) {
        return filter.filter && filter.filter !== filter
            ? !matchesFilter(filter.filter, lowerAttrs)
            : false;
    }
    if (type.startsWith('and')) return (filter.filters || []).every((f) => matchesFilter(f, lowerAttrs));
    if (type.startsWith('or')) return (filter.filters || []).some((f) => matchesFilter(f, lowerAttrs));

    const attrName = String(filter.attribute || '').toLowerCase();
    const value = lowerAttrs[attrName];

    if (type.includes('presence')) return value !== undefined && value !== '';
    if (value === undefined || value === '') return false;

    const target = normalizeForMatch(value, attrName);

    if (type.includes('substring')) {
        const initial = filter.initial ? normalizeForMatch(filter.initial, attrName) : '';
        const finalPart = filter.final ? normalizeForMatch(filter.final, attrName) : '';
        const anyParts = (filter.any || []).map((p) => normalizeForMatch(p, attrName));

        if (initial && !target.startsWith(initial)) return false;
        if (finalPart && !target.endsWith(finalPart)) return false;
        let pos = initial.length;
        for (const part of anyParts) {
            const idx = target.indexOf(part, pos);
            if (idx === -1) return false;
            pos = idx + part.length;
        }
        return true;
    }

    if (type.includes('equality') || type.includes('approximate')) {
        return target === normalizeForMatch(filter.value, attrName);
    }

    return false;
}

// Collect the literal search terms in a filter (ignoring objectclass) so we
// can reject browse-all queries that would dump all 3,200 contacts on the phone
function extractSearchTerms(filter, terms = []) {
    const type = String(filter.type || '').toLowerCase();

    if (type.startsWith('and') || type.startsWith('or')) {
        (filter.filters || []).forEach((f) => extractSearchTerms(f, terms));
    } else if (type.startsWith('not')) {
        if (filter.filter && filter.filter !== filter) extractSearchTerms(filter.filter, terms);
    } else if (String(filter.attribute || '').toLowerCase() !== 'objectclass') {
        if (type.includes('substring')) {
            [filter.initial, ...(filter.any || []), filter.final]
                .filter(Boolean)
                .forEach((part) => terms.push(String(part)));
        } else if (filter.value !== undefined && filter.value !== null) {
            terms.push(String(filter.value));
        }
    }
    return terms;
}

const ldapServer = ldap.createServer();

// Anonymous bind (the phone connects without credentials)
ldapServer.bind('', (req, res, next) => {
    console.log(`[LDAP] Bind from ${req.connection.remoteAddress} dn="${req.dn}"`);
    res.end();
    return next();
});

ldapServer.search(LDAP_BASE_DN, async (req, res, next) => {
    const startedAt = Date.now();
    const filterStr = req.filter.toString();
    console.log(`[LDAP] Search from ${req.connection.remoteAddress}: base="${req.dn}" scope=${req.scope} filter=${filterStr}`);

    try {
        const contacts = await getCachedContacts();

        const terms = extractSearchTerms(req.filter);
        const longestTerm = terms.reduce((max, t) => Math.max(max, t.length), 0);
        if (longestTerm < LDAP_MIN_TERM_LENGTH) {
            console.log(`[LDAP] Query too broad (longest term ${longestTerm} chars) → returning 0 entries`);
            res.end();
            return next();
        }

        let sent = 0;
        for (const entry of buildLdapEntries(contacts)) {
            if (sent >= LDAP_MAX_RESULTS) break;
            if (matchesFilter(req.filter, entry.lower)) {
                res.send({ dn: entry.dn, attributes: entry.attributes });
                sent++;
            }
        }

        console.log(`[LDAP] → ${sent} entries in ${Date.now() - startedAt}ms`);
        res.end();
        return next();
    } catch (err) {
        console.error('[LDAP] Search failed:', err);
        return next(new ldap.OperationsError(err.message));
    }
});

// Root DSE / out-of-base searches: answer politely with nothing
ldapServer.search('', (req, res, next) => {
    console.log(`[LDAP] Search outside base DN (base="${req.dn}") → 0 entries`);
    res.end();
    return next();
});

ldapServer.on('error', (err) => {
    console.error('[LDAP] Server error:', err);
});

ldapServer.listen(LDAP_PORT, '0.0.0.0', () => {
    console.log(`LDAP server listening on ldap://0.0.0.0:${LDAP_PORT} (base DN: ${LDAP_BASE_DN})`);
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

// Warm the contact cache at startup so the first phone query is fast
refreshContacts().catch((err) => {
    console.error('[cache] Initial contact fetch failed (will retry on demand):', err.message);
});
