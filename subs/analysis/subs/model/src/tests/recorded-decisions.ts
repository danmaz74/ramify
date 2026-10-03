import type { Model, ImportQuestion, ImportDecision } from '../interfaces/model.js';

// Recorded with the pre-iteration engine e0be049658b922ba6606172f1cf5166c01a49f1d;
// Plan 8 added the empty `companions` field to each original; project
// boundaries added `auxiliary: false` to each origin, all beneath `src/`.
export const recorded: { model: Model; questions: readonly ImportQuestion[]; decisions: readonly ImportDecision[] } = {
  "model": {
    "registry": {
      "id": "registry/1:[[\"browser\",\"required-symbol\",null],[\"dispatch\",\"required-importer\",null],[\"testing\",\"required-importer\",null],[\"ui\",\"required-importer\",null]]",
      "definitions": [
        {
          "name": "browser",
          "kind": "required-symbol"
        },
        {
          "name": "dispatch",
          "kind": "required-importer"
        },
        {
          "name": "testing",
          "kind": "required-importer"
        },
        {
          "name": "ui",
          "kind": "required-importer"
        }
      ],
      "isDefault": true
    },
    "modules": [
      {
        "id": "app",
        "name": "app",
        "parent": null,
        "headerTags": [],
        "areas": [
          {
            "owner": "app",
            "kind": "ordinary",
            "root": "src",
            "profile": []
          },
          {
            "owner": "app",
            "kind": "tests",
            "root": "src/tests",
            "profile": [
              "testing"
            ]
          }
        ]
      },
      {
        "id": "app/consumer",
        "name": "consumer",
        "parent": "app",
        "headerTags": [],
        "areas": [
          {
            "owner": "app/consumer",
            "kind": "ordinary",
            "root": "subs/consumer/src",
            "profile": []
          },
          {
            "owner": "app/consumer",
            "kind": "tests",
            "root": "subs/consumer/src/tests",
            "profile": [
              "testing"
            ]
          }
        ]
      },
      {
        "id": "app/provider",
        "name": "provider",
        "parent": "app",
        "headerTags": [],
        "areas": [
          {
            "owner": "app/provider",
            "kind": "ordinary",
            "root": "subs/provider/src",
            "profile": []
          },
          {
            "owner": "app/provider",
            "kind": "tests",
            "root": "subs/provider/src/tests",
            "profile": [
              "testing"
            ]
          }
        ]
      }
    ],
    "originals": [
      {
        "id": {
          "kind": "code",
          "owner": "app/provider",
          "file": "api.ts",
          "binding": "hidden"
        },
        "origin": {
          "file": "subs/provider/src/api.ts",
          "area": {
            "owner": "app/provider",
            "kind": "ordinary",
            "root": "subs/provider/src",
            "profile": []
          },
          "auxiliary": false
        },
        "hasValue": true,
        "hasType": true,
        "tags": [],
        "declarations": [
          {
            "file": "subs/provider/src/api.ts",
            "start": 0,
            "end": 1,
            "line": 1,
            "column": 1
          }
        ],
        "tagEvidence": [],
        "companions": { "named": [], "evidence": [], "inferred": false, "unresolved": 0 }
      },
      {
        "id": {
          "kind": "code",
          "owner": "app/provider",
          "file": "api.ts",
          "binding": "value"
        },
        "origin": {
          "file": "subs/provider/src/api.ts",
          "area": {
            "owner": "app/provider",
            "kind": "ordinary",
            "root": "subs/provider/src",
            "profile": []
          },
          "auxiliary": false
        },
        "hasValue": true,
        "hasType": true,
        "tags": [],
        "declarations": [
          {
            "file": "subs/provider/src/api.ts",
            "start": 0,
            "end": 1,
            "line": 1,
            "column": 1
          }
        ],
        "tagEvidence": [],
        "companions": { "named": [], "evidence": [], "inferred": false, "unresolved": 0 }
      },
      {
        "id": {
          "kind": "code",
          "owner": "app/provider",
          "file": "tests/helper.ts",
          "binding": "helper"
        },
        "origin": {
          "file": "subs/provider/src/tests/helper.ts",
          "area": {
            "owner": "app/provider",
            "kind": "tests",
            "root": "subs/provider/src/tests",
            "profile": [
              "testing"
            ]
          },
          "auxiliary": false
        },
        "hasValue": true,
        "hasType": true,
        "tags": [
          "testing"
        ],
        "declarations": [
          {
            "file": "subs/provider/src/tests/helper.ts",
            "start": 0,
            "end": 1,
            "line": 1,
            "column": 1
          }
        ],
        "tagEvidence": [],
        "companions": { "named": [], "evidence": [], "inferred": false, "unresolved": 0 }
      }
    ],
    "exposures": [
      {
        "module": "app",
        "original": {
          "kind": "code",
          "owner": "app/provider",
          "file": "api.ts",
          "binding": "value"
        },
        "names": [
          "value"
        ],
        "destinations": [
          "descendants"
        ],
        "evidence": [
          {
            "file": "module.ramify",
            "start": 3,
            "end": 4,
            "line": 4,
            "column": 1
          }
        ],
        "provider": "app/provider",
        "effective": true
      },
      {
        "module": "app/provider",
        "original": {
          "kind": "code",
          "owner": "app/provider",
          "file": "api.ts",
          "binding": "value"
        },
        "names": [
          "value"
        ],
        "destinations": [
          "parent"
        ],
        "evidence": [
          {
            "file": "subs/provider/module.ramify",
            "start": 3,
            "end": 4,
            "line": 4,
            "column": 1
          }
        ],
        "provider": null,
        "effective": true
      }
    ]
  },
  "questions": [
    {
      "importer": {
        "file": "subs/provider/src/consumer.ts",
        "area": {
          "owner": "app/provider",
          "kind": "ordinary",
          "root": "subs/provider/src",
          "profile": []
        },
        "auxiliary": false
      },
      "location": {
        "file": "subs/provider/src/consumer.ts",
        "start": 0,
        "end": 1,
        "line": 1,
        "column": 1
      },
      "target": {
        "file": "subs/provider/src/api.ts",
        "area": {
          "owner": "app/provider",
          "kind": "ordinary",
          "root": "subs/provider/src",
          "profile": []
        },
        "auxiliary": false
      },
      "forwarding": [],
      "selection": {
        "original": {
          "kind": "code",
          "owner": "app/provider",
          "file": "api.ts",
          "binding": "value"
        },
        "request": "value"
      }
    },
    {
      "importer": {
        "file": "subs/consumer/src/consumer.ts",
        "area": {
          "owner": "app/consumer",
          "kind": "ordinary",
          "root": "subs/consumer/src",
          "profile": []
        },
        "auxiliary": false
      },
      "location": {
        "file": "subs/consumer/src/consumer.ts",
        "start": 0,
        "end": 1,
        "line": 1,
        "column": 1
      },
      "target": {
        "file": "subs/provider/src/api.ts",
        "area": {
          "owner": "app/provider",
          "kind": "ordinary",
          "root": "subs/provider/src",
          "profile": []
        },
        "auxiliary": false
      },
      "forwarding": [],
      "selection": {
        "original": {
          "kind": "code",
          "owner": "app/provider",
          "file": "api.ts",
          "binding": "value"
        },
        "request": "value"
      }
    },
    {
      "importer": {
        "file": "subs/consumer/src/consumer.ts",
        "area": {
          "owner": "app/consumer",
          "kind": "ordinary",
          "root": "subs/consumer/src",
          "profile": []
        },
        "auxiliary": false
      },
      "location": {
        "file": "subs/consumer/src/consumer.ts",
        "start": 0,
        "end": 1,
        "line": 1,
        "column": 1
      },
      "target": {
        "file": "subs/provider/src/api.ts",
        "area": {
          "owner": "app/provider",
          "kind": "ordinary",
          "root": "subs/provider/src",
          "profile": []
        },
        "auxiliary": false
      },
      "forwarding": [],
      "selection": {
        "original": {
          "kind": "code",
          "owner": "app/provider",
          "file": "api.ts",
          "binding": "hidden"
        },
        "request": "value"
      }
    },
    {
      "importer": {
        "file": "subs/consumer/src/consumer.ts",
        "area": {
          "owner": "app/consumer",
          "kind": "ordinary",
          "root": "subs/consumer/src",
          "profile": []
        },
        "auxiliary": false
      },
      "location": {
        "file": "subs/consumer/src/consumer.ts",
        "start": 0,
        "end": 1,
        "line": 1,
        "column": 1
      },
      "target": {
        "file": "subs/provider/src/tests/helper.ts",
        "area": {
          "owner": "app/provider",
          "kind": "tests",
          "root": "subs/provider/src/tests",
          "profile": [
            "testing"
          ]
        },
        "auxiliary": false
      },
      "forwarding": [],
      "selection": {
        "original": {
          "kind": "code",
          "owner": "app/provider",
          "file": "tests/helper.ts",
          "binding": "helper"
        },
        "request": "value"
      }
    },
    {
      "importer": {
        "file": "subs/consumer/src/consumer.ts",
        "area": {
          "owner": "app/consumer",
          "kind": "ordinary",
          "root": "subs/consumer/src",
          "profile": []
        },
        "auxiliary": false
      },
      "location": {
        "file": "subs/consumer/src/consumer.ts",
        "start": 0,
        "end": 1,
        "line": 1,
        "column": 1
      },
      "target": {
        "file": "subs/consumer/src/init.ts",
        "area": {
          "owner": "app/consumer",
          "kind": "ordinary",
          "root": "subs/consumer/src",
          "profile": []
        },
        "auxiliary": false
      },
      "forwarding": [],
      "selection": null
    }
  ],
  "decisions": [
    {
      "status": "allowed",
      "reason": "same-owner",
      "question": {
        "importer": {
          "file": "subs/provider/src/consumer.ts",
          "area": {
            "owner": "app/provider",
            "kind": "ordinary",
            "root": "subs/provider/src",
            "profile": []
          },
          "auxiliary": false
        },
        "target": {
          "file": "subs/provider/src/api.ts",
          "area": {
            "owner": "app/provider",
            "kind": "ordinary",
            "root": "subs/provider/src",
            "profile": []
          },
          "auxiliary": false
        },
        "forwarding": [],
        "location": {
          "file": "subs/provider/src/consumer.ts",
          "start": 0,
          "end": 1,
          "line": 1,
          "column": 1
        },
        "selection": {
          "original": {
            "kind": "code",
            "owner": "app/provider",
            "file": "api.ts",
            "binding": "value"
          },
          "request": "value"
        }
      },
      "original": {
        "id": {
          "kind": "code",
          "owner": "app/provider",
          "file": "api.ts",
          "binding": "value"
        },
        "origin": {
          "file": "subs/provider/src/api.ts",
          "area": {
            "owner": "app/provider",
            "kind": "ordinary",
            "root": "subs/provider/src",
            "profile": []
          },
          "auxiliary": false
        },
        "hasValue": true,
        "hasType": true,
        "tags": [],
        "declarations": [
          {
            "file": "subs/provider/src/api.ts",
            "start": 0,
            "end": 1,
            "line": 1,
            "column": 1
          }
        ],
        "tagEvidence": [],
        "companions": { "named": [], "evidence": [], "inferred": false, "unresolved": 0 }
      },
      "visibility": {
        "visible": true,
        "importer": "app/provider",
        "original": {
          "kind": "code",
          "owner": "app/provider",
          "file": "api.ts",
          "binding": "value"
        },
        "paths": [
          []
        ],
        "ineffective": []
      },
      "requirements": [],
      "checkedOrigins": [
        {
          "file": "subs/provider/src/api.ts",
          "area": {
            "owner": "app/provider",
            "kind": "ordinary",
            "root": "subs/provider/src",
            "profile": []
          },
          "auxiliary": false
        },
        {
          "file": "subs/provider/src/api.ts",
          "area": {
            "owner": "app/provider",
            "kind": "ordinary",
            "root": "subs/provider/src",
            "profile": []
          },
          "auxiliary": false
        }
      ],
      "blockingOrigins": []
    },
    {
      "status": "allowed",
      "reason": "exposed",
      "question": {
        "importer": {
          "file": "subs/consumer/src/consumer.ts",
          "area": {
            "owner": "app/consumer",
            "kind": "ordinary",
            "root": "subs/consumer/src",
            "profile": []
          },
          "auxiliary": false
        },
        "target": {
          "file": "subs/provider/src/api.ts",
          "area": {
            "owner": "app/provider",
            "kind": "ordinary",
            "root": "subs/provider/src",
            "profile": []
          },
          "auxiliary": false
        },
        "forwarding": [],
        "location": {
          "file": "subs/consumer/src/consumer.ts",
          "start": 0,
          "end": 1,
          "line": 1,
          "column": 1
        },
        "selection": {
          "original": {
            "kind": "code",
            "owner": "app/provider",
            "file": "api.ts",
            "binding": "value"
          },
          "request": "value"
        }
      },
      "original": {
        "id": {
          "kind": "code",
          "owner": "app/provider",
          "file": "api.ts",
          "binding": "value"
        },
        "origin": {
          "file": "subs/provider/src/api.ts",
          "area": {
            "owner": "app/provider",
            "kind": "ordinary",
            "root": "subs/provider/src",
            "profile": []
          },
          "auxiliary": false
        },
        "hasValue": true,
        "hasType": true,
        "tags": [],
        "declarations": [
          {
            "file": "subs/provider/src/api.ts",
            "start": 0,
            "end": 1,
            "line": 1,
            "column": 1
          }
        ],
        "tagEvidence": [],
        "companions": { "named": [], "evidence": [], "inferred": false, "unresolved": 0 }
      },
      "visibility": {
        "visible": true,
        "importer": "app/consumer",
        "original": {
          "kind": "code",
          "owner": "app/provider",
          "file": "api.ts",
          "binding": "value"
        },
        "paths": [
          [
            {
              "module": "app/provider",
              "destination": "parent",
              "evidence": [
                {
                  "file": "subs/provider/module.ramify",
                  "start": 3,
                  "end": 4,
                  "line": 4,
                  "column": 1
                }
              ]
            },
            {
              "module": "app",
              "destination": "descendants",
              "evidence": [
                {
                  "file": "module.ramify",
                  "start": 3,
                  "end": 4,
                  "line": 4,
                  "column": 1
                }
              ]
            }
          ]
        ],
        "ineffective": []
      },
      "requirements": [],
      "checkedOrigins": [
        {
          "file": "subs/provider/src/api.ts",
          "area": {
            "owner": "app/provider",
            "kind": "ordinary",
            "root": "subs/provider/src",
            "profile": []
          },
          "auxiliary": false
        },
        {
          "file": "subs/provider/src/api.ts",
          "area": {
            "owner": "app/provider",
            "kind": "ordinary",
            "root": "subs/provider/src",
            "profile": []
          },
          "auxiliary": false
        }
      ],
      "blockingOrigins": []
    },
    {
      "status": "denied",
      "reason": "not-visible",
      "question": {
        "importer": {
          "file": "subs/consumer/src/consumer.ts",
          "area": {
            "owner": "app/consumer",
            "kind": "ordinary",
            "root": "subs/consumer/src",
            "profile": []
          },
          "auxiliary": false
        },
        "target": {
          "file": "subs/provider/src/api.ts",
          "area": {
            "owner": "app/provider",
            "kind": "ordinary",
            "root": "subs/provider/src",
            "profile": []
          },
          "auxiliary": false
        },
        "forwarding": [],
        "location": {
          "file": "subs/consumer/src/consumer.ts",
          "start": 0,
          "end": 1,
          "line": 1,
          "column": 1
        },
        "selection": {
          "original": {
            "kind": "code",
            "owner": "app/provider",
            "file": "api.ts",
            "binding": "hidden"
          },
          "request": "value"
        }
      },
      "original": {
        "id": {
          "kind": "code",
          "owner": "app/provider",
          "file": "api.ts",
          "binding": "hidden"
        },
        "origin": {
          "file": "subs/provider/src/api.ts",
          "area": {
            "owner": "app/provider",
            "kind": "ordinary",
            "root": "subs/provider/src",
            "profile": []
          },
          "auxiliary": false
        },
        "hasValue": true,
        "hasType": true,
        "tags": [],
        "declarations": [
          {
            "file": "subs/provider/src/api.ts",
            "start": 0,
            "end": 1,
            "line": 1,
            "column": 1
          }
        ],
        "tagEvidence": [],
        "companions": { "named": [], "evidence": [], "inferred": false, "unresolved": 0 }
      },
      "visibility": {
        "visible": false,
        "importer": "app/consumer",
        "original": {
          "kind": "code",
          "owner": "app/provider",
          "file": "api.ts",
          "binding": "hidden"
        },
        "paths": [],
        "ineffective": []
      },
      "requirements": [],
      "checkedOrigins": [
        {
          "file": "subs/provider/src/api.ts",
          "area": {
            "owner": "app/provider",
            "kind": "ordinary",
            "root": "subs/provider/src",
            "profile": []
          },
          "auxiliary": false
        },
        {
          "file": "subs/provider/src/api.ts",
          "area": {
            "owner": "app/provider",
            "kind": "ordinary",
            "root": "subs/provider/src",
            "profile": []
          },
          "auxiliary": false
        }
      ],
      "blockingOrigins": []
    },
    {
      "status": "denied",
      "reason": "testing-origin",
      "question": {
        "importer": {
          "file": "subs/consumer/src/consumer.ts",
          "area": {
            "owner": "app/consumer",
            "kind": "ordinary",
            "root": "subs/consumer/src",
            "profile": []
          },
          "auxiliary": false
        },
        "target": {
          "file": "subs/provider/src/tests/helper.ts",
          "area": {
            "owner": "app/provider",
            "kind": "tests",
            "root": "subs/provider/src/tests",
            "profile": [
              "testing"
            ]
          },
          "auxiliary": false
        },
        "forwarding": [],
        "location": {
          "file": "subs/consumer/src/consumer.ts",
          "start": 0,
          "end": 1,
          "line": 1,
          "column": 1
        },
        "selection": {
          "original": {
            "kind": "code",
            "owner": "app/provider",
            "file": "tests/helper.ts",
            "binding": "helper"
          },
          "request": "value"
        }
      },
      "original": {
        "id": {
          "kind": "code",
          "owner": "app/provider",
          "file": "tests/helper.ts",
          "binding": "helper"
        },
        "origin": {
          "file": "subs/provider/src/tests/helper.ts",
          "area": {
            "owner": "app/provider",
            "kind": "tests",
            "root": "subs/provider/src/tests",
            "profile": [
              "testing"
            ]
          },
          "auxiliary": false
        },
        "hasValue": true,
        "hasType": true,
        "tags": [
          "testing"
        ],
        "declarations": [
          {
            "file": "subs/provider/src/tests/helper.ts",
            "start": 0,
            "end": 1,
            "line": 1,
            "column": 1
          }
        ],
        "tagEvidence": [],
        "companions": { "named": [], "evidence": [], "inferred": false, "unresolved": 0 }
      },
      "visibility": null,
      "requirements": [],
      "checkedOrigins": [
        {
          "file": "subs/provider/src/tests/helper.ts",
          "area": {
            "owner": "app/provider",
            "kind": "tests",
            "root": "subs/provider/src/tests",
            "profile": [
              "testing"
            ]
          },
          "auxiliary": false
        },
        {
          "file": "subs/provider/src/tests/helper.ts",
          "area": {
            "owner": "app/provider",
            "kind": "tests",
            "root": "subs/provider/src/tests",
            "profile": [
              "testing"
            ]
          },
          "auxiliary": false
        }
      ],
      "blockingOrigins": [
        {
          "file": "subs/provider/src/tests/helper.ts",
          "area": {
            "owner": "app/provider",
            "kind": "tests",
            "root": "subs/provider/src/tests",
            "profile": [
              "testing"
            ]
          },
          "auxiliary": false
        },
        {
          "file": "subs/provider/src/tests/helper.ts",
          "area": {
            "owner": "app/provider",
            "kind": "tests",
            "root": "subs/provider/src/tests",
            "profile": [
              "testing"
            ]
          },
          "auxiliary": false
        }
      ]
    },
    {
      "status": "allowed",
      "reason": "symbol-free",
      "question": {
        "importer": {
          "file": "subs/consumer/src/consumer.ts",
          "area": {
            "owner": "app/consumer",
            "kind": "ordinary",
            "root": "subs/consumer/src",
            "profile": []
          },
          "auxiliary": false
        },
        "target": {
          "file": "subs/consumer/src/init.ts",
          "area": {
            "owner": "app/consumer",
            "kind": "ordinary",
            "root": "subs/consumer/src",
            "profile": []
          },
          "auxiliary": false
        },
        "forwarding": [],
        "location": {
          "file": "subs/consumer/src/consumer.ts",
          "start": 0,
          "end": 1,
          "line": 1,
          "column": 1
        },
        "selection": null
      },
      "original": null,
      "visibility": null,
      "requirements": [],
      "checkedOrigins": [
        {
          "file": "subs/consumer/src/init.ts",
          "area": {
            "owner": "app/consumer",
            "kind": "ordinary",
            "root": "subs/consumer/src",
            "profile": []
          },
          "auxiliary": false
        }
      ],
      "blockingOrigins": []
    }
  ]
};
