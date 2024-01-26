"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TO_PROTOCOL = void 0;
const router_sdk_1 = require("@uniswap/router-sdk");
const TO_PROTOCOL = (protocol) => {
    switch (protocol.toLowerCase()) {
        case 'v3':
            return router_sdk_1.Protocol.V3;
        case 'v2':
            return router_sdk_1.Protocol.V2;
        case 'mixed':
            return router_sdk_1.Protocol.MIXED;
        default:
            throw new Error(`Unknown protocol: {id}`);
    }
};
exports.TO_PROTOCOL = TO_PROTOCOL;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvdG9jb2xzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL3V0aWwvcHJvdG9jb2xzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLG9EQUErQztBQUV4QyxNQUFNLFdBQVcsR0FBRyxDQUFDLFFBQWdCLEVBQVksRUFBRTtJQUN4RCxRQUFRLFFBQVEsQ0FBQyxXQUFXLEVBQUUsRUFBRTtRQUM5QixLQUFLLElBQUk7WUFDUCxPQUFPLHFCQUFRLENBQUMsRUFBRSxDQUFDO1FBQ3JCLEtBQUssSUFBSTtZQUNQLE9BQU8scUJBQVEsQ0FBQyxFQUFFLENBQUM7UUFDckIsS0FBSyxPQUFPO1lBQ1YsT0FBTyxxQkFBUSxDQUFDLEtBQUssQ0FBQztRQUN4QjtZQUNFLE1BQU0sSUFBSSxLQUFLLENBQUMsd0JBQXdCLENBQUMsQ0FBQztLQUM3QztBQUNILENBQUMsQ0FBQztBQVhXLFFBQUEsV0FBVyxlQVd0QiJ9