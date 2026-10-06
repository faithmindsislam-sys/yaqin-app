"""Keep layer boundaries enforceable as the backend grows."""

import ast
import sys
from importlib.util import resolve_name
from pathlib import Path

APP = Path(__file__).resolve().parents[2] / "app"
GATEWAY_CONTRACTS = (
    "gateways.llm_gateway",
    "gateways.embedding_gateway",
    "gateways.token_gateway",
    "gateways.quran_gateway",
    "gateways.agent_gateway",
    "gateways.speech_gateway",
    "gateways.resource_store",
)
CONTRACT_MODULES = (*GATEWAY_CONTRACTS, "repositories.repository")
ALLOWED = {
    "domain": ("domain",),
    "contracts": ("contracts", "domain"),
    "repositories": ("repositories", "domain"),
    "gateways": ("gateways", "configuration", "domain"),
    "services": ("services", "agents.review", "agents.course", "contracts", "domain", *CONTRACT_MODULES),
    "agents": ("agents", "contracts", "domain", "services.retrieval_service", *CONTRACT_MODULES),
    "controllers": (
        "controllers",
        "contracts",
        "domain",
        "dependencies",
        "http",
        "services",
        "agents.tutor",
        *CONTRACT_MODULES,
        "configuration",
    ),
    "http": ("http", "domain", "configuration", "dependencies", *CONTRACT_MODULES),
}


def test_layers_depend_on_interfaces_instead_of_concrete_providers():
    violations = []
    for layer, allowed in ALLOWED.items():
        for path in (APP / layer).rglob("*.py"):
            source_module = ".".join(path.relative_to(APP).with_suffix("").parts)
            if source_module in CONTRACT_MODULES:
                allowed = ("domain", *CONTRACT_MODULES)
            else:
                allowed = ALLOWED[layer]
            package = "app." + ".".join(path.relative_to(APP).parts[:-1])
            for node in ast.walk(ast.parse(path.read_text())):
                modules = []
                if isinstance(node, ast.Import):
                    modules = [alias.name for alias in node.names]
                elif isinstance(node, ast.ImportFrom):
                    module = "." * node.level + (node.module or "")
                    modules = [resolve_name(module, package) if node.level else module]
                for module in modules:
                    if (
                        (layer in {"domain", "services", "agents"} or source_module in CONTRACT_MODULES)
                        and not module.startswith("app.")
                        and module.split(".")[0] not in sys.stdlib_module_names
                    ):
                        violations.append(f"{path.relative_to(APP)} imports external dependency {module}")
                    if module.startswith("app.") and not any(
                        module == f"app.{prefix}" or module.startswith(f"app.{prefix}.") for prefix in allowed
                    ):
                        violations.append(f"{path.relative_to(APP)} imports {module}")
    assert not violations, "\n".join(violations)
