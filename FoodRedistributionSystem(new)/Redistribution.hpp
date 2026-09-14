#pragma once
#include <iostream>
#include <vector>
#include <queue>
#include <unordered_map>
#include <string>

using namespace std;

//Stack Template
template <typename T>
class Stack {
private:
    vector<T> data;

public:
    void push(const T& value);
    void pop();
    T top();
    bool isEmpty();
    size_t size();
    void display();
    void clear();

    // Add this to allow file handling
    std::vector<T>& getData() { return data; }
    const std::vector<T>& getData() const { return data; }
};



//Queue Template (circular buffer — front/rear wrap around instead of climbing forever)
template <typename T>
class Queue {
private:
    static const int CAPACITY = 100;
    T arr[CAPACITY];
    int front, rear, count;

public:
    Queue();     
    void enqueue(const T& value);
    void dequeue();
    T frontItem();
    bool isEmpty();
    size_t size();
    void display();
    void clear();

    int getFront() const { return front; }
    int getRear() const { return rear; }
    T* getArray() { return arr; }  // returns internal array for file handling
};



//Request Class
class Request {
public:
    string recipientName;
    string foodType;
    int quantity;
    bool isUrgent;
    bool isFulfilled;
    string requestDate;
    string organizationType;  
    string organizationName;  
    string location;          
    int priorityLevel;
    string skipReason;


    Request(); // default constructor
    Request(string name, string food, int qty, string orgType, string orgName, string loc, string date);
    bool operator<(const Request& other) const; // for priority queue
    string getFoodType() const { return foodType; }
    int getQuantity() const { return quantity; }
    string getRequestDate() const { return requestDate; }
    string getSkipReason() const { return skipReason; }
    string getRecipientName() const { return recipientName; }

};


//Priority Queue
template <typename T>
class PriorityQueue {
private:
    vector<T> heap;

public:
    void push(const T& value);
    void pop();
    T top();
    bool isEmpty();
    int size();
    void display();
    const vector<T>& getQueue() const;
    const vector<T>& getHeap() const;
};


//Graph 
template <typename T>
class Graph {
private:
    unordered_map<T, vector<pair<T, int>>> adj; // node -> [(neighbor, weight)]

public:
	void addNode(T node);
    void addEdge(T u, T v, int w);
    void display();
};

// ------------------- Donor Class -------------------
class Donor {
private:
    int donorId;            // Unique ID for donor
    string donorName;       // Name of person or organization
    string contactInfo;     // Phone/email
    string donorType;       // "Individual" or "Organization"
    string address;         // Optional, location of donor

public:
    Donor(int id = 0, string name = "", string contact = "", string type = "Individual", string addr = "");

    int getDonorId() const;
    string getDonorName() const;
    string getContactInfo() const;
    string getDonorType() const;
    string getAddress() const;

    void displayDonor() const;
};

// ------------------- Donor Node -------------------
class DonorNode {
public:
    Donor data;
    DonorNode* next;

    DonorNode(Donor d);
};

// ------------------- Donor Linked List -------------------
class DonorLinkedList {
private:
    DonorNode* head;

public:
    DonorLinkedList();
    ~DonorLinkedList();                                   // frees all nodes
    DonorLinkedList(const DonorLinkedList&) = delete;      // owns raw pointers —
    DonorLinkedList& operator=(const DonorLinkedList&) = delete; // copying would double-free

    void addDonor(Donor d);
    Donor* searchDonor(int id);
    bool removeDonor(int id);
    void displayDonors() const;

    DonorNode* getHead() const {
        return head;
    }

    void saveToFile(const string& filename);
    void loadFromFile(const string& filename);

};

// ------------------- FoodDonation Class -------------------
class FoodDonation {
private:
    int donationId;      // Unique donation ID
    int donorId;         // Link to Donor
    string foodType;     // e.g., "Rice", "Vegetables"
    int quantity;        // Quantity in kg or units
    int originalQuantity;
    string expiryDate;   // Expiry date (if applicable)
    string status;       //Pending or Completed

public:
    FoodDonation(int dId = 0, int drId = 0, string type = "", int qty = 0, string date = "", string stat = "Pending" );


    int getDonationId() const;
    int getDonorId() const;
    string getFoodType() const;
    int getQuantity() const;
    string getExpiryDate() const;
    string getStatus() const;      
    void setStatus(string newStatus);
    int getOriginalQuantity();
    void setOriginalQuantity(int qty);
    void reduceQuantity(int usedQty);
    void displayDonation() const;

};

// ------------------- Donation Node -------------------
class DonationNode {
public:
    FoodDonation data;
    DonationNode* next;

    DonationNode(FoodDonation d);
};

// ------------------- Donation Linked List -------------------
class DonationLinkedList {
private:
    DonationNode* head;

public:
    DonationLinkedList();
    ~DonationLinkedList();                                    // frees all nodes
    DonationLinkedList(const DonationLinkedList&) = delete;    // owns raw pointers —
    DonationLinkedList& operator=(const DonationLinkedList&) = delete; // copying would double-free
    DonationNode* getHead() const { return head; }
    void addDonation(FoodDonation d);
    bool removeDonation(int donationId);
    FoodDonation* searchDonation(int donationId);
    void displayDonations();
    void displayDonationsByDonor(int donorId) const;  // Show all donations by a specific donor
    void displayDonationItemsOnly() const;
    void removeExpiredDonations(const string& todayDate);
    FoodDonation* findMatchingDonation(const string& foodTypeNeeded,
        int quantityNeeded,
        const string& requestDate,
        const Request& request);

    void saveToFile(const string& filename);
    void loadFromFile(const string& filename);
};

//roads
template <typename T>   
class Roads {
private:
    unordered_map<T, vector<pair<T, int>>> roadMap; // node -> [(neighbor, weight)]

public:
    void addRoad(T from, T to, int distance);
    void addLocation(T node);
    void shortestPath(T start, T end);
};


//Include so compiler can see it at compile time (code above this, dont code after it)
#include "redistribution.cpp"
