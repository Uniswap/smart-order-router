"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NodeJSCache = void 0;
class NodeJSCache {
    constructor(nodeCache) {
        this.nodeCache = nodeCache;
    }
    async get(key) {
        return this.nodeCache.get(key);
    }
    async batchGet(keys) {
        const keysArr = Array.from(keys);
        const values = await Promise.all(keysArr.map((key) => this.get(key)));
        const result = {};
        keysArr.forEach((key, index) => {
            result[key] = values[index];
        });
        return result;
    }
    async set(key, value, ttl) {
        if (ttl) {
            return this.nodeCache.set(key, value, ttl);
        }
        else {
            return this.nodeCache.set(key, value);
        }
    }
    async has(key) {
        return this.nodeCache.has(key);
    }
}
exports.NodeJSCache = NodeJSCache;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2FjaGUtbm9kZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9wcm92aWRlcnMvY2FjaGUtbm9kZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFJQSxNQUFhLFdBQVc7SUFDdEIsWUFBb0IsU0FBb0I7UUFBcEIsY0FBUyxHQUFULFNBQVMsQ0FBVztJQUFHLENBQUM7SUFFNUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxHQUFXO1FBQ25CLE9BQU8sSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUksR0FBRyxDQUFDLENBQUM7SUFDcEMsQ0FBQztJQUVELEtBQUssQ0FBQyxRQUFRLENBQUMsSUFBaUI7UUFDOUIsTUFBTSxPQUFPLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNqQyxNQUFNLE1BQU0sR0FBRyxNQUFNLE9BQU8sQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsRUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFdEUsTUFBTSxNQUFNLEdBQWtDLEVBQUUsQ0FBQztRQUVqRCxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUMsR0FBRyxFQUFFLEtBQUssRUFBRSxFQUFFO1lBQzdCLE1BQU0sQ0FBQyxHQUFHLENBQUMsR0FBRyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDOUIsQ0FBQyxDQUFDLENBQUM7UUFFSCxPQUFPLE1BQU0sQ0FBQztJQUNoQixDQUFDO0lBRUQsS0FBSyxDQUFDLEdBQUcsQ0FBQyxHQUFXLEVBQUUsS0FBUSxFQUFFLEdBQVk7UUFDM0MsSUFBSSxHQUFHLEVBQUU7WUFDUCxPQUFPLElBQUksQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxLQUFLLEVBQUUsR0FBRyxDQUFDLENBQUM7U0FDNUM7YUFBTTtZQUNMLE9BQU8sSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsR0FBRyxFQUFFLEtBQUssQ0FBQyxDQUFDO1NBQ3ZDO0lBQ0gsQ0FBQztJQUVELEtBQUssQ0FBQyxHQUFHLENBQUMsR0FBVztRQUNuQixPQUFPLElBQUksQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQ2pDLENBQUM7Q0FDRjtBQS9CRCxrQ0ErQkMifQ==