#include <stdexcept>
#include <fstream>      // for ifstream, ofstream
#include <sstream>      // for stringstream
#include <string>       // for string
#include <iostream>     // cout, cin
#include "Redistribution.hpp"
#include <vector>
#include <istream>
#include <algorithm>   // for std::reverse
using namespace std;

// trim function 
string trim(const string& s) {
    string t = s;
    while (!t.empty() && (t.back() == ' ' || t.back() == '\r' || t.back() == '\n' || t.back() == '\t'))
        t.pop_back();
    size_t i = 0;
    while (i < t.size() && (t[i] == ' ' || t[i] == '\r' || t[i] == '\n' || t[i] == '\t'))
        i++;
    return t.substr(i);
}

//Stack
template <typename T>
void Stack<T>::push(const T& value) { data.push_back(value); }

template <typename T>
void Stack<T>::pop() {
    if (data.empty()) throw out_of_range("Stack is empty");
    data.pop_back();
}

template <typename T>
T Stack<T>::top() {
    if (data.empty()) throw out_of_range("Stack is empty");
    return data.back();
}

template <typename T>
bool Stack<T>::isEmpty() { 
    return data.empty();
}

template <typename T>
size_t Stack<T>::size() {
    return data.size(); 
}

template <typename T>
void Stack<T>::display() {
    for (const auto& item : data) cout << item << " ";
    cout << endl;
}

template <typename T>
void Stack<T>::clear() { 
    data.clear();
}

// save recent fullfilled request
void saveSingleFulfilledRequest(const Request& r, const std::string& filename) {
    bool fileIsEmpty = false;

    // Check if file exists and is empty
    std::ifstream check(filename);
    fileIsEmpty = check.peek() == std::ifstream::traits_type::eof();
    check.close();

    std::ofstream out(filename, std::ios::app); // append mode

    if (!out) {
        std::cout << "Error opening file for saving!\n";
        return;
    }

    // Write CSV header ONLY if file was empty
    if (fileIsEmpty) {
        out << "RecipientName,FoodType,Quantity,OrganizationType,"
            "OrganizationName,Location,PriorityLevel,IsFulfilled,RequestDate\n";
    }

    // Write CSV row
    out << r.recipientName << ","
        << r.foodType << ","
        << r.quantity << ","
        << r.organizationType << ","
        << r.organizationName << ","
        << r.location << ","
        << r.priorityLevel << ","
        << r.isFulfilled << ","
        << r.requestDate << "\n";

    out.close();
}

// load fullfilled requests
void loadFulfilledRequests(Stack<Request>& fulfilled, const string& filename)
{
    ifstream in(filename);
    if (!in) return;

    fulfilled.clear();

    string line;
    getline(in, line);

    while (getline(in, line))
    {
        if (line.empty()) continue;

        stringstream ss(line);
        string value;

        Request r;

        getline(ss, r.recipientName, ',');
        getline(ss, r.foodType, ',');

        getline(ss, value, ',');
        if (value.empty()) continue;
        r.quantity = atoi(value.c_str());

        getline(ss, r.organizationType, ',');
        getline(ss, r.organizationName, ',');
        getline(ss, r.location, ',');

        getline(ss, value, ',');
        r.priorityLevel = atoi(value.c_str());

        getline(ss, value, ',');
        r.isFulfilled = (value == "1" || value == "true");

        getline(ss, r.requestDate);

        fulfilled.push(r);
    }

    in.close();
}


//Queue
template <typename T>
Queue<T>::Queue() {
    front = 0;
    rear = 0;
    count = 0;
}

template <typename T>
void Queue<T>::enqueue(const T& value) {
    if (count < CAPACITY) {
        arr[rear] = value;
        rear = (rear + 1) % CAPACITY;
        count++;
    }
    else {
        cout << "Queue is full.\n";
    }
}

template <typename T>
void Queue<T>::dequeue() {
    if (!isEmpty()) {
        front = (front + 1) % CAPACITY;
        count--;
    }
    else {
        cout << "Queue is empty.\n";
    }
}

template <typename T>
T Queue<T>::frontItem() {
    if (!isEmpty()) {
        return arr[front];
    }
    else {
        throw out_of_range("Queue is empty");
    }
}

template <typename T>
bool Queue<T>::isEmpty() {
    return count == 0;
}

template <typename T>
size_t Queue<T>::size() {
    return count;
}

template <typename T>
void Queue<T>::display() {
    int idx = front;
    for (int i = 0; i < count; i++) {
        cout << arr[idx] << " ";
        idx = (idx + 1) % CAPACITY;
    }
    cout << endl;
}

template <typename T>
void Queue<T>::clear() {
    front = 0;
    rear = 0;
    count = 0;
}
//----------------RequestClass---------------
Request::Request() {
    recipientName = "";
    foodType = "";
    quantity = 0;
    organizationType = "";
    organizationName = "";
    location = "";
    priorityLevel = 3;
    isFulfilled = false;
    isUrgent = false; 
    requestDate = "";
    skipReason = "";
}

Request::Request(string name, string food, int qty, string orgType, string orgName, string loc, string date) {
    recipientName = name;
    foodType = food;
    quantity = qty;
    organizationType = orgType;
    organizationName = orgName;
    location = loc;
    isFulfilled = false;
    requestDate = date;
    isUrgent = false;
    skipReason = "";

    for (char& c : organizationType) c = toupper(c);

    if (organizationType == "HOSPITAL") priorityLevel = 1;
    else if (organizationType == "OLDAGE HOME") priorityLevel = 2;
    else if (organizationType == "CHARITY") priorityLevel = 3;
    else priorityLevel = 4;

    isUrgent = (priorityLevel == 1);
}

bool Request::operator<(const Request& other) const {
    return priorityLevel > other.priorityLevel;
}

template <>
void Queue<Request>::display() {
    for (int i = front; i < rear; i++) {
        cout << i << ". " << arr[i].recipientName << " from " << arr[i].organizationName << " (" << arr[i].organizationType << ") wants "
            << arr[i].quantity << " of " << arr[i].foodType
            << (arr[i].isUrgent ? " [URGENT]" : "")
            << (arr[i].isFulfilled ? " [FULFILLED]" : " [PENDING]")
            << endl;
    }
}


// Helper functions for heap operations
template <typename T>
void heapifyUp(vector<T>& heap, int index) {
    while (index > 0) {
        int parent = (index - 1) / 2;
        if (heap[index] < heap[parent]) break;
        T temp = heap[index];
        heap[index] = heap[parent];
        heap[parent] = temp;
        index = parent;
    }
}

template <typename T>
void heapifyDown(vector<T>& heap, int index) {
    int n = heap.size();
    while (true) {
        int left = 2 * index + 1;
        int right = 2 * index + 2;
        int largest = index;

        // Use operator< instead of > for custom types
        if (left < n && heap[largest] < heap[left]) largest = left;
        if (right < n && heap[largest] < heap[right]) largest = right;

        if (largest == index) break;

        T temp = heap[index];
        heap[index] = heap[largest];
        heap[largest] = temp;

        index = largest;
    }
}

// PriorityQueue 
template <typename T>
void PriorityQueue<T>::push(const T& value) {
    heap.push_back(value);
    heapifyUp(heap, heap.size() - 1);
}

template <typename T>
void PriorityQueue<T>::pop() {
    if (heap.empty()) {
        cout << "PriorityQueue is empty.\n";
        return;
    }
    heap[0] = heap.back();
    heap.pop_back();
    if (!heap.empty()) heapifyDown(heap, 0);
}

template <typename T>
T PriorityQueue<T>::top() {
    if (heap.empty()) {
        cout << "PriorityQueue is empty.\n";
        return T(); // return default T
    }
    return heap[0];
}

template <typename T>
bool PriorityQueue<T>::isEmpty() {
    return heap.empty();
}

template <typename T>
int PriorityQueue<T>::size() {
    return heap.size();
}

template <typename T>
void PriorityQueue<T>::display() {
    for (int i = 0; i < heap.size(); i++) {
        // Use a readable format for Request objects
        cout << heap[i].recipientName << " from " << heap[i].organizationName
            << " (" << heap[i].organizationType << ") wants "
            << heap[i].quantity << " of " << heap[i].foodType
            << (heap[i].isUrgent ? " [URGENT]" : "")
            << (heap[i].isFulfilled ? " [FULFILLED]" : " [PENDING]")
            << endl;
    }
}
template <typename T>
const vector<T>& PriorityQueue<T>::getHeap() const {
    return heap;
}

//save Pending Requests
void savePendingRequests(Queue<Request>& q, const std::string& filename) {
    std::ofstream out(filename);
    if (!out) { std::cout << "Cannot open file: " << filename << "\n"; return; }

    Queue<Request> temp = q; // copy so original queue is not modified

    while (!temp.isEmpty()) {
        Request r = temp.frontItem();
        temp.dequeue();
        out << r.recipientName << ","
            << r.foodType << ","
            << r.quantity << ","
            << r.organizationType << ","
            << r.organizationName << ","
            << r.location << ","
            << r.requestDate << ","
            << r.isFulfilled << ","
            << r.priorityLevel << "\n";
    }
    out.close();
}
// load pending requests
void loadPendingRequests(Queue<Request>& q, const string filename)
{
    ifstream in(filename);
    if (!in) {
        cout << "Error opening file!\n";
        return;
    }

    string line;

    while (getline(in, line))
    {
        stringstream ss(line);
        string value;

        Request r;

        getline(ss, r.recipientName, ',');
        getline(ss, r.foodType, ',');

        getline(ss, value, ',');
        r.quantity = stoi(value);

        getline(ss, r.organizationType, ',');
        getline(ss, r.organizationName, ',');
        getline(ss, r.location, ',');
        getline(ss, r.requestDate, ',');

        getline(ss, value, ',');
        r.isFulfilled = (value == "1" || value == "true");

        getline(ss, value, ',');
        r.priorityLevel = stoi(value);

        q.enqueue(r);
    }

    in.close();
}


// save Urgent Requests
void saveUrgentRequests(PriorityQueue<Request>& pq, const std::string& filename)
{
    // Check if file exists and is empty
    std::ifstream check(filename);
    bool fileIsEmpty = check.peek() == std::ifstream::traits_type::eof();
    check.close();

    std::ofstream out(filename);
    if (!out) {
        std::cout << "Error opening file!\n";
        return;
    }

    // Write CSV header only if file is empty
    if (fileIsEmpty) {
        out << "RecipientName,FoodType,Quantity,OrganizationType,OrganizationName,"
               "Location,RequestDate,IsFulfilled,PriorityLevel\n";
    }

    // Loop over the internal heap using the getter
    const std::vector<Request>& tempHeap = pq.getHeap();
    for (const Request& r : tempHeap) {
        out << r.recipientName << ","
            << r.foodType << ","
            << r.quantity << ","
            << r.organizationType << ","
            << r.organizationName << ","
            << r.location << ","
            << r.requestDate << ","
            << r.isFulfilled << ","
            << r.priorityLevel << "\n";
    }

    out.close();
}

// load urgent requests
void loadUrgentRequests(PriorityQueue<Request>& pq, const std::string& filename) {
    std::ifstream in(filename);
    if (!in) return;

    pq = PriorityQueue<Request>(); // reset
    std::string line;
    getline(in, line); // skip header

    while (getline(in, line)) {
        if (line.empty()) continue;

        std::stringstream ss(line);
        std::string name, food, orgType, orgName, loc, date;
        std::string fulfilledStr, prioStr, qtyStr;
        int qty = 0, prio = 0;
        bool fulfilled = false;

        getline(ss, name, ',');
        getline(ss, food, ',');
        getline(ss, qtyStr, ',');
        getline(ss, orgType, ',');
        getline(ss, orgName, ',');
        getline(ss, loc, ',');
        getline(ss, date, ',');
        getline(ss, fulfilledStr, ',');
        getline(ss, prioStr);

        if (!qtyStr.empty()) qty = stoi(qtyStr);
        if (!prioStr.empty()) prio = stoi(prioStr);

        fulfilled = (fulfilledStr == "1" || fulfilledStr == "true");

        Request r(name, food, qty, orgType, orgName, loc, date);
        r.isFulfilled = fulfilled;
        r.priorityLevel = prio;

        pq.push(r);
    }
    in.close();
}


//display fullfiled stack 
template <>
void Stack<Request>::display() {
    for (const auto& r : data) {
        cout << r.recipientName << " from " << r.organizationName
            << " (" << r.organizationType << ", " << r.location << ") received "
            << r.quantity << " of " << r.foodType
            << " [Priority: " << r.priorityLevel << "]\n";
    }
}

//Graph
template <typename T>
void Graph<T>::addEdge(T u, T v, int w) {
    adj[u].push_back({ v, w });
    adj[v].push_back({ u, w });
}
template <typename T>
void Graph<T>::addNode(T node) {
    // Only add the node if it doesn't already exist
    if (adj.find(node) == adj.end()) {
        adj[node] = {}; // create empty adjacency list
        cout << "Node added: " << node << endl;
    }
    else {
        cout << "Node already exists: " << node << endl;
    }
}
template <typename T>
void Graph<T>::display()                                {
    for (auto& node : adj) {
        cout << node.first << " -> ";
        for (auto& edge : node.second)
            cout << "(" << edge.first << ", " << edge.second << ") ";
        cout << endl;
    }
}


//Donor Implementation
Donor::Donor(int id, string name, string contact, string type, string addr)
{
    donorId = id;
    donorName = name;
    contactInfo = contact;
    donorType = type;
    address = addr;
}

int Donor::getDonorId() const
{
    return donorId;
}

string Donor::getDonorName() const
{
    return donorName;
}

string Donor::getContactInfo() const
{
    return contactInfo;
}

string Donor::getDonorType() const
{
    return donorType;
}

string Donor::getAddress() const
{
    return address;
}

void Donor::displayDonor() const
{
    cout << "Donor ID: " << donorId
        << ", Name: " << donorName
        << ", Type: " << donorType
        << ", Contact: " << contactInfo
        << ", Address: " << address
        << endl;
}

//DonorNode
DonorNode::DonorNode(Donor d)
{
    data = d;
    next = nullptr;
}

//DonorLinkedList 

DonorLinkedList::DonorLinkedList()
{

    head = nullptr;
}

DonorLinkedList::~DonorLinkedList()
{
    DonorNode* current = head;
    while (current != nullptr) {
        DonorNode* next = current->next;
        delete current;
        current = next;
    }
    head = nullptr;
}

void DonorLinkedList::addDonor(Donor d)
{
    DonorNode* newNode = new DonorNode(d);

    if (!head)
    {
        head = newNode;
        return;
    }

    DonorNode* temp = head;
    while (temp->next)
    {
        temp = temp->next;
    }

    temp->next = newNode;
}

Donor* DonorLinkedList::searchDonor(int id)
{
    DonorNode* temp = head;
    while (temp)
    {
        if (temp->data.getDonorId() == id)
            return &(temp->data);

        temp = temp->next;
    }
    return nullptr;
}

bool DonorLinkedList::removeDonor(int id)
{
    if (!head)
        return false;
    if (head->data.getDonorId() == id)
    {
        DonorNode* toDelete = head;
        head = head->next;
        delete toDelete;
        return true;
    }
    DonorNode* temp = head;
    while (temp->next && temp->next->data.getDonorId() != id)
    {
        temp = temp->next;
    }
    if (!temp->next)
        return false;

    DonorNode* toDelete = temp->next;
    temp->next = temp->next->next;
    delete toDelete;
    return true;
}

void DonorLinkedList::displayDonors() const
{
    if (head == nullptr) {
        cout << "\nNo donors to display." << endl;
    }
    DonorNode* temp = head;
    while (temp)
    {
        temp->data.displayDonor();
        temp = temp->next;
    }
}

void DonorLinkedList::saveToFile(const string& filename)
{
    ofstream out(filename);

    // CSV Header
    out << "DonorID,DonorName,ContactInfo,DonorType,Address\n";

    DonorNode* temp = head;
    while (temp) {

        // Write CSV row
        out << temp->data.getDonorId() << ","
            << temp->data.getDonorName() << ","
            << temp->data.getContactInfo() << ","
            << temp->data.getDonorType() << ","
            << temp->data.getAddress() << "\n";

        temp = temp->next;
    }

    out.close();
}

void DonorLinkedList::loadFromFile(const string& filename)
{
    ifstream in(filename);
    if (!in) return;

    head = nullptr;

    string line;
    getline(in, line); // skip CSV header

    while (getline(in, line))
    {
        if (line.empty()) continue;

        stringstream ss(line);
        string value;

        int id = 0;
        string name, contact, type, addr;

        getline(ss, value, ',');
        id = atoi(value.c_str());

        getline(ss, name, ',');
        getline(ss, contact, ',');
        getline(ss, type, ',');
        getline(ss, addr);

        Donor d(id, name, contact, type, addr);
        addDonor(d);
    }

    in.close();
}

//FoodDonation 
FoodDonation::FoodDonation(int dId, int drId, string type, int qty, string date, string stat)
{
    donationId = dId;
    donorId = drId;
    foodType = type;
    quantity = qty;
    originalQuantity = qty;
    expiryDate = date;
    status = stat;

}

int FoodDonation::getDonationId() const
{
    return donationId;
}
int FoodDonation::getDonorId() const
{
    return donorId;
}
string FoodDonation::getFoodType() const
{
    return foodType;
}
int FoodDonation::getQuantity() const
{
    return quantity;
}
string FoodDonation::getExpiryDate() const
{
    return expiryDate;
}
string FoodDonation::getStatus() const
{
    return status;
}
void FoodDonation::setStatus(string newStatus)
{
    status = newStatus;
}
int FoodDonation:: getOriginalQuantity() 
{
    return originalQuantity;
}
void FoodDonation::setOriginalQuantity(int qty) {
    originalQuantity = qty;
}

void FoodDonation::displayDonation() const
{
    cout << "Donation ID: " << donationId
        << ", Donor ID: " << donorId
        << ", Food: " << foodType
        << ", Quantity: " << quantity
        << ", Expiry: " << expiryDate
        << ", Status: " << status
        << endl;
}

void FoodDonation::reduceQuantity(int usedQty) {
    quantity -= usedQty;
    if (quantity <= 0) {
        quantity = 0;
        status = "Completed";
    }
    else if (quantity > 0 && quantity < originalQuantity) {
        status = "partially completed";
    }
}

//DonationNode 
DonationNode::DonationNode(FoodDonation d)
{
    data = d;
    next = nullptr;
}
//DonationLinkedList
DonationLinkedList::DonationLinkedList()
{
    head = nullptr;
}

DonationLinkedList::~DonationLinkedList()
{
    DonationNode* current = head;
    while (current != nullptr) {
        DonationNode* next = current->next;
        delete current;
        current = next;
    }
    head = nullptr;
}

void DonationLinkedList::addDonation(FoodDonation d)
{
    DonationNode* newNode = new DonationNode(d);
    if (!head)
    {
        head = newNode;
        return;
    }
    DonationNode* temp = head;
    while (temp->next)
    {
        temp = temp->next;
    }
    temp->next = newNode;
}

FoodDonation* DonationLinkedList::searchDonation(int donationId)
{
    DonationNode* temp = head;
    while (temp)
    {
        if (temp->data.getDonationId() == donationId)
            return &(temp->data);
        temp = temp->next;
    }
    return nullptr;
}

bool DonationLinkedList::removeDonation(int donationId)
{
    if (!head)
        return false;
    if (head->data.getDonationId() == donationId)
    {
        DonationNode* toDelete = head;
        head = head->next;
        delete toDelete;
        return true;
    }
    DonationNode* temp = head;
    while (temp->next && temp->next->data.getDonationId() != donationId)
    {
        temp = temp->next;
    }
    if (!temp->next)
        return false;

    DonationNode* toDelete = temp->next;
    temp->next = temp->next->next;
    delete toDelete;
    return true;
}

void DonationLinkedList::displayDonations() 
{
    if (head == nullptr) {
        cout << "\nNo donations to display." << endl;
    }
    DonationNode* temp = head;
    while (temp)
    {
        temp->data.displayDonation();
        temp = temp->next;
    }
}
void DonationLinkedList::displayDonationsByDonor(int donorId) const
{
    DonationNode* temp = head;
    bool found = false;
    while (temp)
    {
        if (temp->data.getDonorId() == donorId)
        {
            temp->data.displayDonation();
            found = true;
        }
        temp = temp->next;
    }
    if (!found)
        cout << "No donations found for donor ID: " << donorId << endl;
}
// to covert in lowercase
string toLower(const string& s) {
    string result = s;
    for (char& c : result) {
        c = tolower(c);
    }
    return result;
}
FoodDonation* DonationLinkedList::findMatchingDonation(const string& foodTypeNeeded, int quantityNeeded, const string& requestDate, const Request& request)
{
    if (head == nullptr) {
        return nullptr;
    }
    string neededLower = toLower(foodTypeNeeded);
    DonationNode* temp = head;
    while (temp != nullptr) {
        FoodDonation& d = temp->data;
        // Food type mismatch
        if (toLower(d.getFoodType()) != neededLower) {
            temp = temp->next;
            continue;
        }
        // Insufficient quantity
        if (d.getQuantity() < quantityNeeded) {
            temp = temp->next;
            continue;
        }
        // Expired
        string expiry = trim(d.getExpiryDate());
        string reqDate = trim(requestDate);
        if (expiry <= reqDate) {
            temp = temp->next;
            continue;
        }
        return &d;
    }
    return nullptr;
}
void DonationLinkedList::displayDonationItemsOnly() const {
    DonationNode* temp = head;
    if (!temp) {
        cout << "No donations available.\n";
        return;
    }
    cout << "Available Food Items:\n";
    while (temp) {
        if (temp->data.getQuantity() > 0) {
            cout << "- " << temp->data.getFoodType()
                << " : " << temp->data.getQuantity() << endl;
        }
        temp = temp->next;
    }
}
void DonationLinkedList::removeExpiredDonations(const string& todayDate) {
    DonationNode* temp = head;
    DonationNode* prev = nullptr;
    bool foundExpired = false;   

    while (temp != nullptr) {
        // expired if expiry <= today
        if (temp->data.getExpiryDate() <= todayDate) {
            foundExpired = true; // NEW

            cout << "Removing expired donation: " << temp->data.getFoodType()
                << " (Expiry: " << temp->data.getExpiryDate() << ")\n";

            // remove node
            if (prev == nullptr) {
                head = temp->next;
                delete temp;
                temp = head;
            }
            else {
                prev->next = temp->next;
                delete temp;
                temp = prev->next;
            }
        }
        else {
            prev = temp;
            temp = temp->next;
        }
    }

    // NEW cout for no expired donations
    if (!foundExpired) {
        cout << "No expired donations found.\n";
    }
}

void DonationLinkedList::saveToFile(const string& filename) {
    ofstream out(filename);
    DonationNode* temp = head;

    while (temp) {
        out << temp->data.getDonationId() << ","
            << temp->data.getDonorId() << ","
            << temp->data.getFoodType() << ","
            << temp->data.getQuantity() << ","
            << temp->data.getExpiryDate() << ","
            << temp->data.getStatus() << "\n";
        temp = temp->next;
    }

    out.close();
}
void DonationLinkedList::loadFromFile(const string& filename)
{
    ifstream in(filename);
    if (!in) return;

    head = nullptr;

    string line;

    while (getline(in, line))
    {
        if (line.empty()) continue;

        stringstream ss(line);
        string value;

        int did = 0, donorid = 0, qty = 0;
        string food, exp, stat;

        getline(ss, value, ',');
        did = atoi(value.c_str());

        getline(ss, value, ',');
        donorid = atoi(value.c_str());

        getline(ss, food, ',');

        getline(ss, value, ',');
        qty = atoi(value.c_str());

        getline(ss, exp, ',');
        getline(ss, stat);

        FoodDonation d(did, donorid, food, qty, exp, stat);
        addDonation(d);
    }

    in.close();
}


void displayDonorDonationStatistics(DonorLinkedList& donors, DonationLinkedList& donations) {
    cout << "\n==================================================\n";
    cout << "          DONOR & DONATION STATISTICS            \n";
    cout << "==================================================\n\n";

    //Donor statistics
    int totalDonors = 0;
    int individualDonors = 0;
    int organizationDonors = 0;

    DonorNode* dTemp = donors.getHead();
    while (dTemp) {
        totalDonors++;
        if (toLower(dTemp->data.getDonorType()) == "indivisual") individualDonors++;
        else if (toLower(dTemp->data.getDonorType()) == "organization") organizationDonors++;
        dTemp = dTemp->next;
    }

    //Donation statistics
    int totalDonations = 0;
    int totalCompleted = 0;
    int totalPartial = 0;
    int totalPending = 0;
    int totalQuantityRemaining = 0;

    DonationNode* fTemp = donations.getHead();
    while (fTemp) {
        totalDonations++;
        int remaining = fTemp->data.getQuantity();
        int original = fTemp->data.getOriginalQuantity();

        totalQuantityRemaining += remaining;

        if (remaining == 0) totalCompleted++;
        else if (remaining < original) totalPartial++;  // partially fulfilled
        else totalPending++;                             // fully pending

        fTemp = fTemp->next;
    }

    //Display statistics
    cout << "TOTAL DONORS                   : " << totalDonors << endl;
    cout << "  - Indivisual Donors          : " << individualDonors << endl;
    cout << "  - Organization Donors        : " << organizationDonors << endl;

    cout << "TOTAL DONATIONS RECEIVED        : " << totalDonations << endl;
    cout << "  - Fully Pending Donations    : " << totalPending << endl;
    cout << "  - Partially Fulfilled        : " << totalPartial << endl;
    cout << "  - Fully Completed Donations  : " << totalCompleted << endl;

    cout << "TOTAL QUANTITY REMAINING        : " << totalQuantityRemaining << " units\n";

    cout << "\n==================================================\n\n";
}


//Roads
template <typename T>
void Roads<T>::addLocation(T location) {
    if (roadMap.find(location) == roadMap.end()) {
        roadMap[location] = {};
    }
    else {
        cout << "Location already exists: " << location << endl;
    }
}

template <typename T>
void Roads<T>::addRoad(T from, T to, int distance) {
	Graph<T> graph;
    roadMap[from].push_back({ to, distance });
    roadMap[to].push_back({ from, distance });

    graph.addEdge(from, to, distance);                  
}


template <typename T>
void Roads<T>::shortestPath(T start, T end) {
    // Dijkstra using the project's custom PriorityQueue (max-heap).
    // We push negative distances so the max-heap behaves like a min-heap.
    unordered_map<T, int> dist;
    unordered_map<T, T> prev;

    PriorityQueue<pair<int, T>> pq; // will store { -distance, node }

    // Initialize distances and predecessors
    for (const auto& loc : roadMap) {
        dist[loc.first] = INT_MAX;
        prev[loc.first] = T();
    }

    // Validate nodes
    if (roadMap.find(start) == roadMap.end() || roadMap.find(end) == roadMap.end()) {
        cout << "No path from " << start << " to " << end << " (unknown location)\n";
        return;
    }

    dist[start] = 0;
    pq.push({ 0, start }); // -0 == 0

    while (!pq.isEmpty()) {
        auto top = pq.top();
        pq.pop();

        int negDist = top.first;        // stored as negative
        T current = top.second;
        int currentDist = -negDist;     // real (non-negative) distance

        // skip stale entries
        if (currentDist != dist[current]) continue;

        if (current == end) break;

        for (const auto& neighbor : roadMap[current]) {
            T next = neighbor.first;
            int weight = neighbor.second;
            if (dist[current] == INT_MAX) continue; // unreachable so far
            int alt = dist[current] + weight;
            if (alt < dist[next]) {
                dist[next] = alt;
                prev[next] = current;
                pq.push({ -alt, next }); // push negative so max-heap gives smallest distance
            }
        }
    }

    if (dist[end] == INT_MAX) {
        cout << "No path from " << start << " to " << end << endl;
        return;
    }

    // Reconstruct path
    vector<T> path;
    T at = end;
    while (!(at == T())) {
        path.push_back(at);
        if (prev[at] == T()) break;
        at = prev[at];
    }
    reverse(path.begin(), path.end());

    // Display path
    cout << "[Shortest path from " << start << " to " << end << ": ";
    for (size_t i = 0; i < path.size(); ++i) {
        cout << path[i];
        if (i + 1 < path.size()) cout << " -> ";
    }
    cout << " (Distance: " << dist[end] << ") ]" << endl;
}

string karachiLocations[] = {
    "Clifton", "Saddar", "PECHS", "Gulshan-e-Iqbal", "Korangi",
    "North Nazimabad", "Malir", "Lyari", "Defense", "Bahadurabad",
    "Shahrah-e-Faisal", "Gulberg", "Landhi", "SITE", "Buffer Zone"
};
const int NUM_LOCATIONS = 15;
Roads<string> karachiRoads;

// Initialize locations and roads
void initializeKarachiMap() {
    // Add all locations
    for (int i = 0; i < NUM_LOCATIONS; i++) {
        karachiRoads.addLocation(karachiLocations[i]);
    }

    karachiRoads.addRoad("Saddar", "Clifton", 8);
    karachiRoads.addRoad("Saddar", "PECHS", 5);
    karachiRoads.addRoad("Saddar", "Lyari", 4);
    karachiRoads.addRoad("Saddar", "Gulshan-e-Iqbal", 10);
    karachiRoads.addRoad("Saddar", "North Nazimabad", 12);

    karachiRoads.addRoad("Clifton", "Defense", 6);
    karachiRoads.addRoad("Defense", "PECHS", 6);
    karachiRoads.addRoad("Defense", "Korangi", 12);

    karachiRoads.addRoad("PECHS", "Bahadurabad", 3);
    karachiRoads.addRoad("Bahadurabad", "Gulshan-e-Iqbal", 6);
    karachiRoads.addRoad("Gulshan-e-Iqbal", "Gulistan-e-Jauhar", 4);
    karachiRoads.addRoad("Gulistan-e-Jauhar", "Malir", 9);

    // Use the same name as karachiLocations array
    karachiRoads.addRoad("Malir", "Shahrah-e-Faisal", 5);
    karachiRoads.addRoad("Shahrah-e-Faisal", "Korangi", 6);

    karachiRoads.addRoad("Korangi", "Landhi", 8);
    karachiRoads.addRoad("Landhi", "SITE", 14);

    karachiRoads.addRoad("North Nazimabad", "Buffer Zone", 5);
    karachiRoads.addRoad("Buffer Zone", "Gulberg", 4);
    karachiRoads.addRoad("Gulberg", "Gulshan-e-Iqbal", 7);

    karachiRoads.addRoad("SITE", "Lyari", 7);
    karachiRoads.addRoad("SITE", "North Nazimabad", 11);

    karachiRoads.addRoad("Clifton", "Lyari", 6);
    // fixed name here too:
    karachiRoads.addRoad("Gulistan-e-Jauhar", "Shahrah-e-Faisal", 5);

    karachiRoads.addRoad("Bahadurabad", "Korangi", 10);
    karachiRoads.addRoad("Gulshan-e-Iqbal", "Malir", 12);

    // Optional: debug output to verify nodes/edges after initialization
    // Remove/comment this in production
    cout << "Karachi road map initialized:\n";
}

