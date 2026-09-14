// ============================================================================
// server_main.cpp
//
// Web Edition entry point. This does NOT touch the original console app
// (FoodRedistributionSystem.cpp) — it's a separate executable that reuses
// the exact same DSA engine (Stack, Queue, PriorityQueue, linked lists,
// Graph/Dijkstra) from Redistribution.hpp / redistribution.cpp and exposes
// it over a small local JSON API so the web frontend can drive it.
//
// Build this as its OWN project/executable. Do not include this file in
// the same build as FoodRedistributionSystem.cpp (both define main()).
// ============================================================================

#define CPPHTTPLIB_NO_EXCEPTIONS 0
#include "httplib.h"
#include "json.hpp"
#include "Redistribution.hpp"
#include <iostream>
#include <cstdlib>

using json = nlohmann::json;
using namespace std;

// ---- Shared engine state (same structures the console app uses) ----------
static DonorLinkedList donors;
static DonationLinkedList donations;
static PriorityQueue<Request> requestPQ;
static Queue<Request> pendingQueue;
static Stack<Request> fulfilledStack;

static const vector<string> predefinedLocations = {
    "Clifton", "Saddar", "PECHS", "Gulshan-e-Iqbal", "Korangi",
    "North Nazimabad", "Malir", "Lyari", "Defense", "Bahadurabad",
    "Shahrah-e-Faisal", "Gulberg", "Landhi", "SITE", "Buffer Zone"
};

static void persistAll() {
    donors.saveToFile("donors.csv");
    donations.saveToFile("donations.csv");
    savePendingRequests(pendingQueue, "pending.csv");
    saveUrgentRequests(requestPQ, "urgent.csv");
}

// ---- JSON conversion helpers ----------------------------------------------
static json donorToJson(const Donor& d) {
    return json{
        {"id", d.getDonorId()},
        {"name", d.getDonorName()},
        {"contact", d.getContactInfo()},
        {"type", d.getDonorType()},
        {"address", d.getAddress()}
    };
}

static json donationToJson(FoodDonation& f) {
    return json{
        {"donationId", f.getDonationId()},
        {"donorId", f.getDonorId()},
        {"foodType", f.getFoodType()},
        {"quantity", f.getQuantity()},
        {"originalQuantity", f.getOriginalQuantity()},
        {"expiryDate", f.getExpiryDate()},
        {"status", f.getStatus()}
    };
}

static json requestToJson(const Request& r) {
    return json{
        {"recipientName", r.recipientName},
        {"foodType", r.foodType},
        {"quantity", r.quantity},
        {"isUrgent", r.isUrgent},
        {"isFulfilled", r.isFulfilled},
        {"requestDate", r.requestDate},
        {"organizationType", r.organizationType},
        {"organizationName", r.organizationName},
        {"location", r.location},
        {"priorityLevel", r.priorityLevel},
        {"skipReason", r.skipReason}
    };
}

int main() {
    initializeKarachiMap();
    donors.loadFromFile("donors.csv");
    donations.loadFromFile("donations.csv");
    loadFulfilledRequests(fulfilledStack, "fulfilled_request.csv");
    loadPendingRequests(pendingQueue, "pending.csv");
    loadUrgentRequests(requestPQ, "urgent.csv");

    httplib::Server svr;

    // CORS so the frontend (served separately, e.g. from a file or a dev
    // server on a different port) can call this API during local dev.
    svr.set_default_headers({
        { "Access-Control-Allow-Origin", "*" },
        { "Access-Control-Allow-Headers", "Content-Type" },
        { "Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS" }
    });
    svr.Options(R"(/.*)", [](const httplib::Request&, httplib::Response& res) {
        res.status = 204;
    });

    // Serve the dashboard itself (index.html + assets) from this same
    // server, so a single deployed service works as the whole app —
    // no separate static host needed. API routes below still win.
    svr.set_mount_point("/", "./");

    // ---- Static locations -------------------------------------------------
    svr.Get("/api/locations", [](const httplib::Request&, httplib::Response& res) {
        res.set_content(json(predefinedLocations).dump(), "application/json");
    });

    // ---- Donors -------------------------------------------------------------
    svr.Get("/api/donors", [](const httplib::Request&, httplib::Response& res) {
        json arr = json::array();
        DonorNode* n = donors.getHead();
        while (n) { arr.push_back(donorToJson(n->data)); n = n->next; }
        res.set_content(arr.dump(), "application/json");
    });

    svr.Post("/api/donors", [](const httplib::Request& req, httplib::Response& res) {
        try {
            auto body = json::parse(req.body);
            Donor d(body.at("id").get<int>(),
                    body.at("name").get<string>(),
                    body.at("contact").get<string>(),
                    body.value("type", string("Individual")),
                    body.at("address").get<string>());
            donors.addDonor(d);
            persistAll();
            res.set_content(json{{"ok", true}}.dump(), "application/json");
        } catch (const std::exception& e) {
            res.status = 400;
            res.set_content(json{{"ok", false}, {"error", e.what()}}.dump(), "application/json");
        }
    });

    svr.Delete(R"(/api/donors/(\d+))", [](const httplib::Request& req, httplib::Response& res) {
        int id = stoi(req.matches[1]);
        bool removed = donors.removeDonor(id);
        if (removed) persistAll();
        res.set_content(json{{"ok", removed}}.dump(), "application/json");
    });

    // ---- Donations ------------------------------------------------------
    svr.Get("/api/donations", [](const httplib::Request&, httplib::Response& res) {
        json arr = json::array();
        DonationNode* n = donations.getHead();
        while (n) { arr.push_back(donationToJson(n->data)); n = n->next; }
        res.set_content(arr.dump(), "application/json");
    });

    svr.Get(R"(/api/donations/donor/(\d+))", [](const httplib::Request& req, httplib::Response& res) {
        int donorId = stoi(req.matches[1]);
        json arr = json::array();
        DonationNode* n = donations.getHead();
        while (n) {
            if (n->data.getDonorId() == donorId) arr.push_back(donationToJson(n->data));
            n = n->next;
        }
        res.set_content(arr.dump(), "application/json");
    });

    svr.Post("/api/donations", [](const httplib::Request& req, httplib::Response& res) {
        try {
            auto body = json::parse(req.body);
            int donorId = body.at("donorId").get<int>();
            if (!donors.searchDonor(donorId)) {
                res.status = 400;
                res.set_content(json{{"ok", false}, {"error", "Donor not found"}}.dump(), "application/json");
                return;
            }
            FoodDonation f(body.at("donationId").get<int>(),
                           donorId,
                           body.at("foodType").get<string>(),
                           body.at("quantity").get<int>(),
                           body.at("expiryDate").get<string>(),
                           "Pending");
            donations.addDonation(f);
            persistAll();
            res.set_content(json{{"ok", true}}.dump(), "application/json");
        } catch (const std::exception& e) {
            res.status = 400;
            res.set_content(json{{"ok", false}, {"error", e.what()}}.dump(), "application/json");
        }
    });

    svr.Post("/api/donations/expire", [](const httplib::Request& req, httplib::Response& res) {
        auto body = json::parse(req.body);
        donations.removeExpiredDonations(body.at("today").get<string>());
        persistAll();
        res.set_content(json{{"ok", true}}.dump(), "application/json");
    });

    // ---- Requests ---------------------------------------------------------
    svr.Get("/api/requests/urgent", [](const httplib::Request&, httplib::Response& res) {
        json arr = json::array();
        for (const auto& r : requestPQ.getHeap()) arr.push_back(requestToJson(r));
        res.set_content(arr.dump(), "application/json");
    });

    svr.Get("/api/requests/pending", [](const httplib::Request&, httplib::Response& res) {
        json arr = json::array();
        Queue<Request> temp = pendingQueue;
        while (!temp.isEmpty()) {
            arr.push_back(requestToJson(temp.frontItem()));
            temp.dequeue();
        }
        res.set_content(arr.dump(), "application/json");
    });

    svr.Get("/api/requests/fulfilled", [](const httplib::Request&, httplib::Response& res) {
        json arr = json::array();
        Stack<Request> temp = fulfilledStack;
        while (!temp.isEmpty()) {
            arr.push_back(requestToJson(temp.top()));
            temp.pop();
        }
        res.set_content(arr.dump(), "application/json");
    });

    svr.Post("/api/requests", [](const httplib::Request& req, httplib::Response& res) {
        try {
            auto body = json::parse(req.body);
            Request r(body.at("recipientName").get<string>(),
                      body.at("foodType").get<string>(),
                      body.at("quantity").get<int>(),
                      body.at("organizationType").get<string>(),
                      body.at("organizationName").get<string>(),
                      body.at("location").get<string>(),
                      body.at("requestDate").get<string>());
            requestPQ.push(r);
            persistAll();
            res.set_content(json{{"ok", true}}.dump(), "application/json");
        } catch (const std::exception& e) {
            res.status = 400;
            res.set_content(json{{"ok", false}, {"error", e.what()}}.dump(), "application/json");
        }
    });

    // Runs the exact same matching loop as console option 3, but returns
    // a JSON log of every outcome instead of printing to stdout.
    svr.Post("/api/requests/fulfill", [](const httplib::Request&, httplib::Response& res) {
        json results = json::array();

        while (!requestPQ.isEmpty()) {
            Request r = requestPQ.top();
            requestPQ.pop();

            FoodDonation* match = donations.findMatchingDonation(r.foodType, r.quantity, r.requestDate, r);

            if (match) {
                match->reduceQuantity(r.quantity);
                if (match->getQuantity() == 0) match->setStatus("Completed");
                r.isFulfilled = true;
                fulfilledStack.push(r);
                saveSingleFulfilledRequest(r, "fulfilled_request.csv");

                Donor* donor = donors.searchDonor(match->getDonorId());
                string donorLoc = donor ? donor->getAddress() : "Unknown Location";

                std::ostringstream routeStream;
                std::streambuf* old = std::cout.rdbuf(routeStream.rdbuf());
                karachiRoads.shortestPath(donorLoc, r.location);
                std::cout.rdbuf(old);

                results.push_back({
                    {"status", "fulfilled"},
                    {"request", requestToJson(r)},
                    {"fromLocation", donorLoc},
                    {"route", routeStream.str()}
                });
            } else {
                string needed = toLower(r.foodType);
                string reason = "No matching donation found";
                DonationNode* temp = donations.getHead();
                bool foundType = false;
                while (temp) {
                    FoodDonation& d = temp->data;
                    if (toLower(d.getFoodType()) == needed) {
                        foundType = true;
                        if (d.getQuantity() < r.quantity) {
                            reason = "Insufficient quantity (Available: " + to_string(d.getQuantity()) +
                                     ", Needed: " + to_string(r.quantity) + ")";
                            break;
                        }
                        if ((d.getStatus() != "Pending") && (d.getStatus() != "partially completed")) {
                            reason = "Donation already used";
                            break;
                        }
                        if (trim(d.getExpiryDate()) <= trim(r.requestDate)) {
                            reason = "Donation expired (Expiry: " + d.getExpiryDate() + ")";
                            break;
                        }
                    }
                    temp = temp->next;
                }
                if (!foundType) reason = "Food type '" + r.foodType + "' not in stock";

                r.skipReason = reason;
                pendingQueue.enqueue(r);
                results.push_back({
                    {"status", "pending"},
                    {"request", requestToJson(r)},
                    {"reason", reason}
                });
            }
        }

        persistAll();
        res.set_content(results.dump(), "application/json");
    });

    // ---- Route lookup (Dijkstra via the project's own max-heap) ------------
    svr.Get("/api/route", [](const httplib::Request& req, httplib::Response& res) {
        if (!req.has_param("from") || !req.has_param("to")) {
            res.status = 400;
            res.set_content(json{{"ok", false}, {"error", "from and to are required"}}.dump(), "application/json");
            return;
        }
        std::ostringstream routeStream;
        std::streambuf* old = std::cout.rdbuf(routeStream.rdbuf());
        karachiRoads.shortestPath(req.get_param_value("from"), req.get_param_value("to"));
        std::cout.rdbuf(old);
        res.set_content(json{{"route", routeStream.str()}}.dump(), "application/json");
    });

    // ---- Stats --------------------------------------------------------------
    svr.Get("/api/stats", [](const httplib::Request&, httplib::Response& res) {
        int totalDonors = 0, individualDonors = 0, organizationDonors = 0;
        DonorNode* dTemp = donors.getHead();
        while (dTemp) {
            totalDonors++;
            string t = toLower(dTemp->data.getDonorType());
            if (t == "indivisual" || t == "individual") individualDonors++;
            else if (t == "organization") organizationDonors++;
            dTemp = dTemp->next;
        }

        int totalDonations = 0, totalCompleted = 0, totalPartial = 0, totalPending = 0, totalQuantityRemaining = 0;
        DonationNode* fTemp = donations.getHead();
        while (fTemp) {
            totalDonations++;
            int remaining = fTemp->data.getQuantity();
            int original = fTemp->data.getOriginalQuantity();
            totalQuantityRemaining += remaining;
            if (remaining == 0) totalCompleted++;
            else if (remaining < original) totalPartial++;
            else totalPending++;
            fTemp = fTemp->next;
        }

        res.set_content(json{
            {"donors", {
                {"total", totalDonors},
                {"individual", individualDonors},
                {"organization", organizationDonors}
            }},
            {"donations", {
                {"total", totalDonations},
                {"completed", totalCompleted},
                {"partial", totalPartial},
                {"pending", totalPending},
                {"quantityRemaining", totalQuantityRemaining}
            }},
            {"requests", {
                {"urgent", (int)requestPQ.size()},
                {"pending", (int)pendingQueue.size()},
                {"delivered", (int)fulfilledStack.size()}
            }}
        }.dump(), "application/json");
    });

    // Render/Railway/etc. assign the port via $PORT and expect the server
    // to bind 0.0.0.0 so it's reachable from outside the container. Falls
    // back to 8080 + localhost-only for local development.
    const char* portEnv = std::getenv("PORT");
    int port = portEnv ? std::atoi(portEnv) : 8080;
    const char* host = portEnv ? "0.0.0.0" : "localhost";

    cout << "Food Redistribution API running at http://" << host << ":" << port << "\n";
    cout << "Dashboard is served from the same address (index.html).\n";
    svr.listen(host, port);

    return 0;
}
